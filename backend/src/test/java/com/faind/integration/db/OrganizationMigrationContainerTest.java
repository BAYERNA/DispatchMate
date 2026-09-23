package com.faind.integration.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

// 멀티테넌시 1단계(V17)의 핵심 안전장치를 실제 Postgres에 대고 검증한다: 서로 다른 조직이
// 같은 badge_number를 각자 발급해도 더 이상 충돌하지 않는지(조직 단위 유일 제약으로 바뀌었는지),
// 기존 단일 배포 데이터가 DEFAULT 조직으로 깨지지 않고 백필되는지.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class OrganizationMigrationContainerTest {

  @Container
  static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>(DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"))
          .withDatabaseName("faind").withUsername("faind").withPassword("faind");

  @DynamicPropertySource
  static void datasourceProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    registry.add("spring.datasource.username", POSTGRES::getUsername);
    registry.add("spring.datasource.password", POSTGRES::getPassword);
  }

  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private DataSource dataSource;

  @Test
  void 기존_단일배포_데이터는_DEFAULT_조직으로_백필된다() {
    // Flyway가 컨텍스트 기동 시 이미 V1~V17을 전부 적용했으므로, 이 테스트는 그 결과만 확인한다.
    Integer count = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM organizations WHERE code = 'DEFAULT'", Integer.class);
    assertThat(count).isEqualTo(1);
  }

  @Test
  void 서로_다른_조직은_같은_badge_number를_각자_쓸_수_있다() {
    UUID orgA = insertOrganization("ORG-A", "테스트조직A");
    UUID orgB = insertOrganization("ORG-B", "테스트조직B");

    insertUser(orgA, "0001");
    // 다른 조직이 같은 배지번호 0001을 쓰는 건 이제 허용된다(조직 단위 유일 제약).
    insertUser(orgB, "0001");

    Integer count = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM users WHERE badge_number = '0001'", Integer.class);
    assertThat(count).isEqualTo(2);
  }

  @Test
  void 같은_조직_안에서는_badge_number가_여전히_유일하다() {
    UUID org = insertOrganization("ORG-C", "테스트조직C");
    insertUser(org, "0001");

    assertThatThrownBy(() -> insertUser(org, "0001"))
        .hasMessageContaining("uq_users_org_badge");
  }

  // V18: federation_agencies도 조직별로 나뉜다 — 서로 다른 조직이 같은 agency_code를 각자
  // 등록해도(신뢰 파트너 기관 목록이 조직마다 다를 수 있으므로) 서로의 인증서 지문을
  // 덮어쓰지 않아야 한다.
  @Test
  void 서로_다른_조직은_같은_federation_agency_code를_각자_쓸_수_있다() {
    UUID orgA = insertOrganization("ORG-D", "테스트조직D");
    UUID orgB = insertOrganization("ORG-E", "테스트조직E");

    insertFederationAgency(orgA, "PARTNER-01", "인접소방서A용");
    insertFederationAgency(orgB, "PARTNER-01", "인접소방서B용");

    Integer count = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM federation_agencies WHERE agency_code = 'PARTNER-01'", Integer.class);
    assertThat(count).isEqualTo(2);
  }

  @Test
  void 같은_조직_안에서는_federation_agency_code가_여전히_유일하다() {
    UUID org = insertOrganization("ORG-F", "테스트조직F");
    insertFederationAgency(org, "PARTNER-02", "1차 등록");

    assertThatThrownBy(() -> insertFederationAgency(org, "PARTNER-02", "2차 등록"))
        .hasMessageContaining("uq_federation_agencies_org_code");
  }

  // V20: 조직 온보딩 부트스트랩 — SUPER_ADMIN 역할이 허용되고, 로그인 가능한 초기 계정이
  // 실제로 존재해야 한다(이게 없으면 새 조직을 만들 방법 자체가 없다).
  @Test
  void 부트스트랩_SUPER_ADMIN_계정이_DEFAULT_조직에_존재한다() {
    Integer count = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM users u JOIN organizations o ON o.organization_id = u.organization_id "
            + "WHERE u.role = 'SUPER_ADMIN' AND u.badge_number = 'SUPERADMIN' AND o.code = 'DEFAULT'",
        Integer.class);
    assertThat(count).isEqualTo(1);
  }

  @Test
  void users_role_제약이_SUPER_ADMIN을_허용한다() {
    UUID org = insertOrganization("ORG-G", "테스트조직G");
    jdbcTemplate.update(
        "INSERT INTO users(organization_id, name, role, badge_number, password_hash) "
            + "VALUES (?, '테스트', 'SUPER_ADMIN', 'SA-TEST', 'hash')",
        org);

    Integer count = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM users WHERE badge_number = 'SA-TEST' AND role = 'SUPER_ADMIN'", Integer.class);
    assertThat(count).isEqualTo(1);
  }

  // V21: assurance 데이터 보존(retention) 실행계획도 조직별로 나뉜다 — organization_id
  // 없이는 저장 자체가 안 돼야 한다(이게 없으면 notification-server의 execute 단계가
  // cutoff만으로 모든 조직 데이터를 지우는 구멍으로 되돌아간다).
  @Test
  void retention_execution_plans는_organization_id_없이_저장할_수_없다() {
    UUID org = insertOrganization("ORG-H", "테스트조직H");
    UUID admin = insertAdminUser(org, "ADMIN-H");
    UUID policyId = radioTranscriptPolicyId();

    assertThatThrownBy(() -> jdbcTemplate.update(
            "INSERT INTO retention_execution_plans(policy_id, cutoff_at, created_by) VALUES (?, now(), ?)",
            policyId, admin))
        .hasMessageContaining("organization_id");
  }

  @Test
  void retention_execution_plans는_조직별로_섞이지_않고_저장된다() {
    UUID orgA = insertOrganization("ORG-I", "테스트조직I");
    UUID orgB = insertOrganization("ORG-J", "테스트조직J");
    UUID adminA = insertAdminUser(orgA, "ADMIN-I");
    UUID adminB = insertAdminUser(orgB, "ADMIN-J");
    UUID policyId = radioTranscriptPolicyId();

    insertRetentionExecutionPlan(policyId, orgA, adminA);
    insertRetentionExecutionPlan(policyId, orgB, adminB);

    Integer countForOrgA = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM retention_execution_plans WHERE organization_id = ?", Integer.class, orgA);
    assertThat(countForOrgA).isEqualTo(1);
  }

  private UUID radioTranscriptPolicyId() {
    return jdbcTemplate.queryForObject(
        "SELECT policy_id FROM data_retention_policies WHERE data_category = 'radio_transcript'", UUID.class);
  }

  private void insertRetentionExecutionPlan(UUID policyId, UUID organizationId, UUID createdBy) {
    jdbcTemplate.update(
        "INSERT INTO retention_execution_plans(policy_id, organization_id, cutoff_at, created_by) "
            + "VALUES (?, ?, now(), ?)",
        policyId, organizationId, createdBy);
  }

  private UUID insertAdminUser(UUID organizationId, String badgeNumber) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO users(user_id, organization_id, name, role, badge_number, password_hash) "
            + "VALUES (?, ?, '관리자', 'ADMIN', ?, 'hash')",
        id, organizationId, badgeNumber);
    return id;
  }

  private void insertFederationAgency(UUID organizationId, String agencyCode, String name) {
    jdbcTemplate.update(
        "INSERT INTO federation_agencies(organization_id, agency_code, name) VALUES (?, ?, ?)",
        organizationId, agencyCode, name);
  }

  private UUID insertOrganization(String code, String name) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO organizations(organization_id, code, name, type) VALUES (?, ?, ?, 'PUBLIC')",
        id, code, name);
    return id;
  }

  private void insertUser(UUID organizationId, String badgeNumber) {
    jdbcTemplate.update(
        "INSERT INTO users(organization_id, name, role, badge_number, password_hash) "
            + "VALUES (?, '테스트', 'RESPONDER', ?, 'hash')",
        organizationId, badgeNumber);
  }
}

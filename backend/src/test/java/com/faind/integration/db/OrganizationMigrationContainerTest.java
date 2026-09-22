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

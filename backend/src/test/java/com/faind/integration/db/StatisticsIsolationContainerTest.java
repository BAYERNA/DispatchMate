package com.faind.integration.db;

import static org.assertj.core.api.Assertions.assertThat;

import com.faind.domain.report.repository.ReportAnalysisRepository;
import com.faind.domain.statistics.repository.AiJudgmentLogQueryRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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

// 멀티테넌시 1단계 후속: ADM-009 통계 대시보드(FR-13, FR-27)가 실제로 발견된 유출 지점이었다 —
// ai_judgment_logs/report_analyses 둘 다 organization_id 컬럼이 없어 incident_id(→reports)를
// 통한 서브쿼리로만 조직을 가릴 수 있는데, 그 서브쿼리 자체가 Mockito로는 검증되지 않는다.
// 실제 Postgres에 두 조직의 데이터를 함께 넣고 한쪽만 집계되는지 직접 확인한다.
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class StatisticsIsolationContainerTest {

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
  @Autowired private AiJudgmentLogQueryRepository aiJudgmentLogQueryRepository;
  @Autowired private ReportAnalysisRepository reportAnalysisRepository;

  private UUID orgA;
  private UUID orgB;
  private UUID incidentA;
  private UUID incidentB;

  @BeforeEach
  void setUp() {
    orgA = insertOrganization("ORG-G", "테스트조직G");
    orgB = insertOrganization("ORG-H", "테스트조직H");
    incidentA = insertIncident(orgA, "2026-STAT-A0001");
    incidentB = insertIncident(orgB, "2026-STAT-B0001");

    insertAiJudgmentLog(incidentA, "CCTV_DETECTION");
    insertAiJudgmentLog(incidentB, "CCTV_DETECTION");
    insertAiJudgmentLog(incidentB, "CCTV_DETECTION");

    UUID userA = insertUser(orgA, "S001");
    UUID reportA = insertReport(incidentA, userA);
    insertReportAnalysis(reportA, "REVIEWED");

    UUID userB = insertUser(orgB, "S001");
    UUID reportB1 = insertReport(incidentB, userB);
    UUID reportB2 = insertReport(incidentB, userB);
    insertReportAnalysis(reportB1, "REVIEWED");
    insertReportAnalysis(reportB2, "PENDING");
  }

  @Test
  void ai_판단_로그_통계는_호출한_조직의_출동에_걸린_것만_센다() {
    assertThat(aiJudgmentLogQueryRepository.count(orgA)).isEqualTo(1);
    assertThat(aiJudgmentLogQueryRepository.count(orgB)).isEqualTo(2);
    assertThat(aiJudgmentLogQueryRepository.countByJudgmentType("CCTV_DETECTION", orgA)).isEqualTo(1);
    assertThat(aiJudgmentLogQueryRepository.countByJudgmentType("CCTV_DETECTION", orgB)).isEqualTo(2);
  }

  @Test
  void 보고서_검토_완료율_통계는_호출한_조직의_보고서만_센다() {
    assertThat(reportAnalysisRepository.countByOrganization(orgA)).isEqualTo(1);
    assertThat(reportAnalysisRepository.countByOrganization(orgB)).isEqualTo(2);
    assertThat(reportAnalysisRepository.countByReviewStatusAndOrganization("REVIEWED", orgA)).isEqualTo(1);
    assertThat(reportAnalysisRepository.countByReviewStatusAndOrganization("REVIEWED", orgB)).isEqualTo(1);
  }

  private UUID insertOrganization(String code, String name) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO organizations(organization_id, code, name, type) VALUES (?, ?, ?, 'PUBLIC')", id, code, name);
    return id;
  }

  private UUID insertIncident(UUID organizationId, String incidentNumber) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO incidents(incident_id, organization_id, incident_number, incident_type, reported_at, status, source) "
            + "VALUES (?, ?, ?, 'FIRE', ?, 'DISPATCHED', 'MANUAL_REPORT')",
        id, organizationId, incidentNumber, LocalDateTime.now());
    return id;
  }

  private void insertAiJudgmentLog(UUID incidentId, String judgmentType) {
    jdbcTemplate.update(
        "INSERT INTO ai_judgment_logs(judgment_id, judgment_type, related_incident_id) VALUES (?, ?, ?)",
        UUID.randomUUID(), judgmentType, incidentId);
  }

  private UUID insertUser(UUID organizationId, String badgeNumber) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO users(user_id, organization_id, name, role, badge_number, password_hash) "
            + "VALUES (?, ?, '테스트', 'RESPONDER', ?, 'hash')",
        id, organizationId, badgeNumber);
    return id;
  }

  private UUID insertReport(UUID incidentId, UUID authorId) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO reports(report_id, incident_id, author_id, status) VALUES (?, ?, ?, 'SUBMITTED')",
        id, incidentId, authorId);
    return id;
  }

  private void insertReportAnalysis(UUID reportId, String reviewStatus) {
    jdbcTemplate.update(
        "INSERT INTO report_analyses(analysis_id, report_id, review_status) VALUES (?, ?, ?)",
        UUID.randomUUID(), reportId, reviewStatus);
  }
}

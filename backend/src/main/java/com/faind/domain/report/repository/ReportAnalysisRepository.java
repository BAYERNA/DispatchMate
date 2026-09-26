package com.faind.domain.report.repository;

import com.faind.domain.report.entity.ReportAnalysis;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReportAnalysisRepository extends JpaRepository<ReportAnalysis, UUID> {

  Optional<ReportAnalysis> findByReportId(UUID reportId);

  // 멀티테넌시 1단계: report_analyses는 organization_id가 없다 — report_id를 통해 reports로,
  // 거기서 incident_id를 통해 incidents.organizationId로 이어지는 서브쿼리로 조직을 가린다
  // (FR-13 검토 완료율 통계가 다른 조직 보고서까지 세지 않도록).
  @Query("select count(a) from ReportAnalysis a where a.reportId in "
      + "(select r.reportId from Report r where r.incidentId in "
      + "(select i.incidentId from Incident i where i.organizationId = :organizationId))")
  long countByOrganization(UUID organizationId);

  @Query("select count(a) from ReportAnalysis a where a.reviewStatus = :reviewStatus and a.reportId in "
      + "(select r.reportId from Report r where r.incidentId in "
      + "(select i.incidentId from Incident i where i.organizationId = :organizationId))")
  long countByReviewStatusAndOrganization(String reviewStatus, UUID organizationId);
}

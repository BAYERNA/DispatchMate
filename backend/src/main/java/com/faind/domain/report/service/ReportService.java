package com.faind.domain.report.service;

import com.faind.domain.report.dto.ReportAnalysisResponse;
import com.faind.domain.report.dto.ReportResponse;
import com.faind.domain.report.dto.ReportSaveRequest;
import com.faind.domain.report.dto.ReviewStatsResponse;
import com.faind.domain.report.entity.Report;
import com.faind.domain.report.entity.ReportAnalysis;
import com.faind.domain.report.repository.ReportAnalysisRepository;
import com.faind.domain.report.repository.ReportRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.integration.ai.dto.SopMatchResultDto;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-07/08 — 지난 QA 최대 실패 지점("임시저장/제출 미작동")의 재발 방지가 최우선 목표.
// saveDraft/submit 모두 반드시 트랜잭션 안에서 엔티티 상태를 바꾸고, 컨트롤러가 그 결과를
// 200 응답 바디로 명시적으로 돌려주게 해(NFR-02) "버튼을 눌러도 반응이 없는" 상태를 없앤다.
@Service
@Transactional(readOnly = true)
public class ReportService {

  private static final Logger log = LoggerFactory.getLogger(ReportService.class);

  private final ReportRepository reportRepository;
  private final ReportAnalysisRepository reportAnalysisRepository;
  private final SopMatchClient sopMatchClient;

  public ReportService(
      ReportRepository reportRepository, ReportAnalysisRepository reportAnalysisRepository, SopMatchClient sopMatchClient) {
    this.reportRepository = reportRepository;
    this.reportAnalysisRepository = reportAnalysisRepository;
    this.sopMatchClient = sopMatchClient;
  }

  // FR-05: 출동 종료 확정 시 배정된 대원 수만큼 DRAFT 보고서를 한 번에 만든다 (IncidentClosedListener 전용).
  // REQUIRES_NEW: IncidentClosedListener도 AFTER_COMMIT에서 호출된다 — 이유는
  // IncidentService.savePreAnalysisResult 주석 참조 (기본 REQUIRED면 조용히 커밋 유실).
  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
  public List<UUID> createDraftsForIncident(UUID incidentId, List<UUID> responderIds) {
    return responderIds.stream()
        .map(responderId -> reportRepository.save(new Report(incidentId, responderId)).getReportId())
        .toList();
  }

  public List<ReportResponse> getMyReports(UUID authorId) {
    return reportRepository.findByAuthorIdOrderByCreatedAtDesc(authorId).stream().map(ReportResponse::from).toList();
  }

  public ReportResponse get(UUID reportId, UUID requesterId) {
    return ReportResponse.from(findOwnedReport(reportId, requesterId));
  }

  @Transactional
  public ReportResponse saveDraft(UUID reportId, UUID authorId, ReportSaveRequest request) {
    Report report = findOwnedReport(reportId, authorId);
    report.saveDraft(request.content(), request.videoRef());
    return ReportResponse.from(report);
  }

  @Transactional
  public ReportResponse submit(UUID reportId, UUID authorId, ReportSaveRequest request) {
    Report report = findOwnedReport(reportId, authorId);
    report.submit(request.content(), request.videoRef());
    ReportResponse response = ReportResponse.from(report);
    requestSopMatchAnalysis(report);
    return response;
  }

  public ReportAnalysisResponse getAnalysis(UUID reportId, UUID requesterId) {
    findOwnedReport(reportId, requesterId);
    ReportAnalysis analysis = reportAnalysisRepository.findByReportId(reportId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "아직 SOP 대조 분석이 완료되지 않았습니다."));
    return ReportAnalysisResponse.from(analysis);
  }

  // FR-08: 제출 직후 SOP 대조를 요청한다. AI 서버 실패는 보고서 제출 자체를 막지 않는다(NFR-07 보조적 지위).
  private void requestSopMatchAnalysis(Report report) {
    try {
      SopMatchResultDto result = sopMatchClient.match(report.getReportId(), report.getContent(), report.getIncidentId());
      reportAnalysisRepository.save(
          new ReportAnalysis(report.getReportId(), result.sopMatchResult(), result.riskPattern(), result.recommendation()));
    } catch (Exception e) {
      log.warn("SOP 대조 분석 요청 실패 — 리포트 제출은 유지하고 분석만 보류합니다 (reportId={})", report.getReportId(), e);
    }
  }

  // FR-13: statistics 패키지가 "검토 완료율"을 계산할 때 사용 (report_analyses 직접 접근 금지, 이 메서드를 거친다).
  public ReviewStatsResponse getReviewStats(UUID organizationId) {
    long total = reportAnalysisRepository.countByOrganization(organizationId);
    long reviewed = reportAnalysisRepository.countByReviewStatusAndOrganization("REVIEWED", organizationId);
    return new ReviewStatsResponse(total, reviewed);
  }

  private Report findOwnedReport(UUID reportId, UUID requesterId) {
    Report report = reportRepository.findById(reportId).orElseThrow(() -> new BusinessException(ErrorCode.REPORT_NOT_FOUND));
    if (!report.getAuthorId().equals(requesterId)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "본인이 작성한 보고서만 조회·수정할 수 있습니다.");
    }
    return report;
  }
}

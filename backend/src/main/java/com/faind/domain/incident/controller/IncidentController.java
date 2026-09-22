package com.faind.domain.incident.controller;

import com.faind.domain.incident.dto.AiJudgmentSummaryResponse;
import com.faind.domain.incident.dto.AssignmentRequest;
import com.faind.domain.incident.dto.AssignmentResponse;
import com.faind.domain.incident.dto.DashboardSummaryResponse;
import com.faind.domain.incident.dto.IncidentCreateRequest;
import com.faind.domain.incident.dto.IncidentListItemResponse;
import com.faind.domain.incident.dto.IncidentResponse;
import com.faind.domain.incident.dto.MonitoringResponse;
import com.faind.domain.incident.dto.PreAnalysisResponse;
import com.faind.domain.incident.dto.DroneReconRequest;
import com.faind.domain.incident.dto.ResponderStatusRequest;
import com.faind.domain.incident.dto.RouteEstimateResponse;
import com.faind.domain.incident.service.DroneDispatchService;
import com.faind.domain.incident.service.IncidentService;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.global.security.AuthenticatedUser;
import com.faind.global.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// CMD-001 출동지령·사전분석(FR-02) / CMD-002 현장 모니터링(FR-03) / CMD-003 대원 상세(FR-04) /
// CMD-006 출동 종료 처리(FR-05) / FR-12,19,20
@RestController
@RequestMapping("/api/v1/incidents")
public class IncidentController {

  private final IncidentService incidentService;
  private final DroneDispatchService droneDispatchService;

  public IncidentController(IncidentService incidentService, DroneDispatchService droneDispatchService) {
    this.incidentService = incidentService;
    this.droneDispatchService = droneDispatchService;
  }

  // FR-01 유선 신고 접수(관제실) — 사람이 직접 등록하는 즉시 DISPATCHED 경로이므로
  // CCTV 경로(ADM-001 confirm)와 동일하게 ADMIN 전용으로 제한한다.
  @PostMapping
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<IncidentResponse> create(
      @CurrentUser AuthenticatedUser currentUser, @Valid @RequestBody IncidentCreateRequest request) {
    return ResponseEntity.ok(incidentService.create(currentUser.organizationId(), request));
  }

  // ADM-001 관리자 홈 통계 카드 (FR-09)
  @GetMapping("/dashboard-summary")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<DashboardSummaryResponse> getDashboardSummary(@CurrentUser AuthenticatedUser currentUser) {
    return ResponseEntity.ok(incidentService.getDashboardSummary(currentUser.organizationId()));
  }

  // ADM-001 "최근 출동 목록"
  @GetMapping
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Page<IncidentListItemResponse>> listRecent(
      @CurrentUser AuthenticatedUser currentUser, Pageable pageable) {
    return ResponseEntity.ok(incidentService.listRecent(currentUser.organizationId(), pageable));
  }

  // CMD-001 지휘관 태블릿 진입 화면: DISPATCHED/IN_PROGRESS 전체 (CCTV 출처는 commanderId가 없어 개인별 필터 불가)
  @GetMapping("/active")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<List<IncidentResponse>> listActive(@CurrentUser AuthenticatedUser currentUser) {
    return ResponseEntity.ok(incidentService.listActive(currentUser.organizationId()));
  }

  // USR-001 대원 앱 진입 화면: 내가 배정된, 아직 종료되지 않은 출동
  @GetMapping("/my-active")
  @PreAuthorize("hasRole('RESPONDER')")
  public ResponseEntity<List<IncidentResponse>> listMyActive(@CurrentUser AuthenticatedUser currentUser) {
    return ResponseEntity.ok(incidentService.listMyActiveIncidents(currentUser.userId()));
  }

  // USR-001/002/003도 자기 배정 출동을 조회하려 이 엔드포인트를 쓰므로 역할 자체를 막을 수는 없다 —
  // 대신 RESPONDER는 본인이 배정된 출동만 보도록 서비스에서 소유권을 검증한다(동료 생체데이터 등
  // CMD-002 모니터링 데이터가 배정 무관하게 아무 대원에게나 노출되지 않도록).
  @GetMapping("/{incidentId}")
  public ResponseEntity<IncidentResponse> get(@PathVariable UUID incidentId, @CurrentUser AuthenticatedUser currentUser) {
    requireIncidentAccess(incidentId, currentUser);
    return ResponseEntity.ok(incidentService.getIncident(currentUser.organizationId(), incidentId));
  }

  // CMD-001: 사전분석 결과 + NFR-03 검증용 소요시간. responder-app은 호출하지 않는 지휘관 전용 데이터.
  @GetMapping("/{incidentId}/pre-analysis")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<PreAnalysisResponse> getPreAnalysis(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID incidentId) {
    return ResponseEntity.ok(incidentService.getPreAnalysis(currentUser.organizationId(), incidentId));
  }

  // CMD-002 드론 정찰 카드(FR-26) 등에서 사용하는 AI 판단 이력. 지휘관 전용.
  @GetMapping("/{incidentId}/ai-judgments")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<List<AiJudgmentSummaryResponse>> getAiJudgments(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID incidentId) {
    return ResponseEntity.ok(incidentService.getAiJudgments(currentUser.organizationId(), incidentId));
  }

  // FR-20 CMD-001/002: 후발대(소방차) 경로·ETA — 출동 확정 시 관할 소방서 고정 좌표 기준으로 1회 계산돼 캐시된 값. 지휘관 전용.
  @GetMapping("/{incidentId}/route-estimate")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<RouteEstimateResponse> getGroundRouteEstimate(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID incidentId) {
    return ResponseEntity.ok(incidentService.getGroundRouteEstimate(currentUser.organizationId(), incidentId));
  }

  // FR-19: 배정 시 선발대/통신담당 자동 산출
  @PostMapping("/{incidentId}/assignments")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<AssignmentResponse> assign(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID incidentId, @Valid @RequestBody AssignmentRequest request) {
    return ResponseEntity.ok(incidentService.assign(currentUser.organizationId(), incidentId, request));
  }

  // FR-19: 지휘관이 통신 담당 재지정
  @PatchMapping("/{incidentId}/assignments/{userId}/comms-lead")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<AssignmentResponse> reassignCommsLead(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID incidentId, @PathVariable UUID userId) {
    return ResponseEntity.ok(incidentService.reassignCommsLead(currentUser.organizationId(), incidentId, userId));
  }

  // FR-03/04/12: 대원 실시간 상태 적재 (웨어러블·앱에서 주기적으로 전송)
  // 본인 명의로만 보고할 수 있도록 서비스 레벨에서 request.userId()와 currentUser를 대조한다.
  @PostMapping("/{incidentId}/responder-status")
  @PreAuthorize("hasRole('RESPONDER')")
  public ResponseEntity<Void> recordResponderStatus(
      @PathVariable UUID incidentId, @Valid @RequestBody ResponderStatusRequest request,
      @CurrentUser AuthenticatedUser currentUser) {
    incidentService.recordResponderStatus(currentUser.organizationId(), incidentId, request, currentUser.userId());
    return ResponseEntity.ok().build();
  }

  // CMD-002 현장 모니터링 대시보드 전체 데이터. USR-001도 자기 출동 화면에서 재사용하므로
  // get()과 동일하게 RESPONDER는 배정된 출동인지 검증한다.
  @GetMapping("/{incidentId}/monitoring")
  public ResponseEntity<MonitoringResponse> getMonitoring(
      @PathVariable UUID incidentId, @CurrentUser AuthenticatedUser currentUser) {
    requireIncidentAccess(incidentId, currentUser);
    return ResponseEntity.ok(incidentService.getMonitoring(currentUser.organizationId(), incidentId));
  }

  // FR-05 CMD-006 "종료 확정" — QA 최우선 재검증 대상
  @PatchMapping("/{incidentId}/close")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<IncidentResponse> close(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID incidentId) {
    return ResponseEntity.ok(incidentService.close(currentUser.organizationId(), incidentId));
  }

  // FR-26: 드론 도착 후 정찰 결과 콜백 (ai-server → Java 모놀리식)
  // /cctv-detections와 동일하게 InternalServiceAuthFilter가 서비스 토큰으로 검증한다.
  @PostMapping("/drone-dispatches/{dispatchId}/recon-result")
  public ResponseEntity<Void> recordDroneReconResult(
      @PathVariable UUID dispatchId, @Valid @RequestBody DroneReconRequest request) {
    droneDispatchService.recordReconResult(dispatchId, request.confidenceScore(), request.summary(), request.videoRef());
    return ResponseEntity.ok().build();
  }

  // COMMANDER/ADMIN은 배정 무관하게 어떤 출동이든 볼 수 있다(기존 /active 목록과 동일한 전제 —
  // CCTV 출처는 commanderId가 없어 개인별 필터가 애초에 불가능하다). RESPONDER만 배정 여부를 검증한다.
  private void requireIncidentAccess(UUID incidentId, AuthenticatedUser currentUser) {
    if ("RESPONDER".equals(currentUser.role()) && !incidentService.isResponderAssigned(incidentId, currentUser.userId())) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "배정된 출동만 조회할 수 있습니다.");
    }
  }
}

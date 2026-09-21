package com.faind.domain.incident.controller;

import com.faind.domain.incident.dto.AiSuspectedQueueItemResponse;
import com.faind.domain.incident.dto.CctvDetectionRequest;
import com.faind.domain.incident.dto.IncidentResponse;
import com.faind.domain.incident.service.CctvDetectionService;
import com.faind.domain.incident.service.IncidentConfirmService;
import com.faind.global.security.AuthenticatedUser;
import com.faind.global.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// FR-24 CCTV 자동 화재감지 / NFR-08 오탐 방지 게이트 (ADM-001 "AI 의심감지 대기열")
@RestController
@RequestMapping("/api/v1/incidents/dispatch")
public class DispatchController {

  private final CctvDetectionService cctvDetectionService;
  private final IncidentConfirmService incidentConfirmService;

  public DispatchController(CctvDetectionService cctvDetectionService, IncidentConfirmService incidentConfirmService) {
    this.cctvDetectionService = cctvDetectionService;
    this.incidentConfirmService = incidentConfirmService;
  }

  // ai-server(fire_detection_router)가 CCTV 화재 의심을 감지했을 때 호출하는 콜백.
  // 로그인 사용자 JWT 대신 InternalServiceAuthFilter가 faind.security.internal-service-token으로
  // 검증한다 (미설정 시 503으로 거부).
  @PostMapping("/cctv-detections")
  public ResponseEntity<UUID> receiveCctvDetection(@Valid @RequestBody CctvDetectionRequest request) {
    return ResponseEntity.ok(cctvDetectionService.receiveDetection(request, "AUTO"));
  }

  // ADM-010(Phase 5) 관제실이 상시 감시 화면에서 위험 카메라를 발견해 수동으로 등록하는 경로.
  // 결과(AI_SUSPECTED 생성)는 /cctv-detections와 동일하지만, 인증 방식이 다르다 — 이건 사람이
  // 로그인한 세션(JWT)에서 호출하므로 InternalServiceAuthFilter가 아니라 일반 @PreAuthorize로
  // 검증한다. internal-service-token이 설정된 배포 환경에서도 ADMIN 세션으로 문제없이 동작해야
  // 하기 때문에 내부 서비스 전용 경로를 재사용하지 않고 별도 엔드포인트로 분리했다.
  @PostMapping("/manual-detection")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<UUID> receiveManualDetection(@Valid @RequestBody CctvDetectionRequest request) {
    return ResponseEntity.ok(cctvDetectionService.receiveDetection(request, "MANUAL"));
  }

  // ADM-001 "AI 의심감지 대기열" — admin-web 전용 화면, confirm/reject와 동일하게 ADMIN만 조회.
  @GetMapping("/ai-suspected")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<List<AiSuspectedQueueItemResponse>> getSuspectedQueue() {
    return ResponseEntity.ok(cctvDetectionService.getSuspectedQueue());
  }

  // ADM-001 "확인·출동" — NFR-08: role=ADMIN만 허용, 이 순간 IncidentCreatedEvent 발행
  @PatchMapping("/{incidentId}/confirm")
  public ResponseEntity<IncidentResponse> confirm(@PathVariable UUID incidentId, @CurrentUser AuthenticatedUser currentUser) {
    return ResponseEntity.ok(incidentConfirmService.confirm(incidentId, currentUser));
  }

  // ADM-001 "오탐 처리"
  @PatchMapping("/{incidentId}/reject")
  public ResponseEntity<IncidentResponse> reject(@PathVariable UUID incidentId, @CurrentUser AuthenticatedUser currentUser) {
    return ResponseEntity.ok(incidentConfirmService.rejectAsFalsePositive(incidentId, currentUser));
  }
}

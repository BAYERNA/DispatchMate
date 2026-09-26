package com.faind.domain.incident.service;

import com.faind.domain.device.dto.DeviceResponse;
import com.faind.domain.device.service.DeviceService;
import com.faind.domain.incident.dto.AiSuspectedQueueItemResponse;
import com.faind.domain.incident.dto.CctvDetectionRequest;
import com.faind.domain.incident.entity.AiJudgmentLog;
import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentStatus;
import com.faind.domain.incident.event.CctvSuspectedDetectedEvent;
import com.faind.domain.incident.repository.AiJudgmentLogRepository;
import com.faind.domain.incident.repository.IncidentRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-24: ai-server의 fire_detection_router가 CCTV 화재 의심을 감지했을 때 호출하는 콜백 진입점.
// NFR-08의 핵심 — 여기서는 incidents.status를 절대 DISPATCHED로 만들지 않는다(AI_SUSPECTED 고정).
// 정식 출동 전환은 오직 IncidentConfirmService.confirm()(role=ADMIN)을 통해서만 가능하다.
@Service
public class CctvDetectionService {

  private final IncidentRepository incidentRepository;
  private final AiJudgmentLogRepository aiJudgmentLogRepository;
  private final IncidentNumberGenerator incidentNumberGenerator;
  private final DeviceService deviceService;
  private final ApplicationEventPublisher eventPublisher;

  public CctvDetectionService(
      IncidentRepository incidentRepository,
      AiJudgmentLogRepository aiJudgmentLogRepository,
      IncidentNumberGenerator incidentNumberGenerator,
      DeviceService deviceService,
      ApplicationEventPublisher eventPublisher) {
    this.incidentRepository = incidentRepository;
    this.aiJudgmentLogRepository = aiJudgmentLogRepository;
    this.incidentNumberGenerator = incidentNumberGenerator;
    this.deviceService = deviceService;
    this.eventPublisher = eventPublisher;
  }

  // detectionSource: "AUTO"(ai-server CCTV 폴링, /cctv-detections) | "MANUAL"(ADM-010 관제실
  // 수동 등록, /manual-detection). 호출한 컨트롤러가 정하는 값이라 요청 바디로 위조할 수 없다.
  @Transactional
  public UUID receiveDetection(CctvDetectionRequest request, String detectionSource) {
    DeviceResponse camera = deviceService.get(request.cameraDeviceId());
    LocalDateTime detectedAt = request.detectedAt() != null ? request.detectedAt() : LocalDateTime.now();

    Incident incident = Incident.cctvSuspected(
        camera.organizationId(),
        incidentNumberGenerator.next(),
        request.addressHint() != null ? request.addressHint() : camera.serialNo(),
        camera.latitude(),
        camera.longitude(),
        detectedAt);
    incidentRepository.save(incident);

    AiJudgmentLog log = new AiJudgmentLog(
        "CCTV_DETECTION", incident.getIncidentId(), null, request.cameraDeviceId(), request.confidenceScore(),
        request.dangerScore(), detectionSource, request.snapshotBase64(), request.summary());
    aiJudgmentLogRepository.save(log);

    // FR-24/25 선제적 드론 배정: 관리자 확인을 기다리지 않고 정찰용 드론을 미리 띄운다 — incident
    // 상태는 여전히 AI_SUSPECTED로 남는다(NFR-08 위반 아님).
    eventPublisher.publishEvent(new CctvSuspectedDetectedEvent(incident.getIncidentId()));

    return incident.getIncidentId();
  }

  // ADM-001 "AI 의심감지 대기열 · 확인 필요 N건" — status=AI_SUSPECTED인 출동을 감지 로그와 함께 보여준다.
  public List<AiSuspectedQueueItemResponse> getSuspectedQueue() {
    return incidentRepository.findByStatusOrderByReportedAtDesc(IncidentStatus.AI_SUSPECTED).stream()
        .map(this::toQueueItem)
        .toList();
  }

  private AiSuspectedQueueItemResponse toQueueItem(Incident incident) {
    Optional<AiJudgmentLog> log =
        aiJudgmentLogRepository.findByRelatedIncidentIdOrderByCreatedAtDesc(incident.getIncidentId()).stream().findFirst();
    return new AiSuspectedQueueItemResponse(
        incident.getIncidentId(),
        log.map(AiJudgmentLog::getJudgmentId).orElse(null),
        log.map(AiJudgmentLog::getSourceDeviceId).orElse(null),
        incident.getAddress(),
        incident.getReportedAt(),
        log.map(AiJudgmentLog::getConfidenceScore).orElse(null),
        incident.getStatus().name(),
        log.map(AiJudgmentLog::getSnapshotBase64).orElse(null));
  }
}

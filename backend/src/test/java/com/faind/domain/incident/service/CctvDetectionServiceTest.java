package com.faind.domain.incident.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.faind.domain.device.dto.DeviceResponse;
import com.faind.domain.device.service.DeviceService;
import com.faind.domain.incident.dto.CctvDetectionRequest;
import com.faind.domain.incident.event.CctvSuspectedDetectedEvent;
import com.faind.domain.incident.repository.AiJudgmentLogRepository;
import com.faind.domain.incident.repository.IncidentRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

// FR-24/25 선제적 드론 배정: 관리자 확인 전(AI_SUSPECTED) CCTV 감지 시점에 정찰용 드론 배정 이벤트를
// 발행하는지 검증한다 — NFR-08(정식 출동 전환은 confirm()에서만)은 이 서비스가 건드리지 않는다.
@ExtendWith(MockitoExtension.class)
class CctvDetectionServiceTest {

  @Mock private IncidentRepository incidentRepository;
  @Mock private AiJudgmentLogRepository aiJudgmentLogRepository;
  @Mock private IncidentNumberGenerator incidentNumberGenerator;
  @Mock private DeviceService deviceService;
  @Mock private ApplicationEventPublisher eventPublisher;

  private CctvDetectionService service;

  @BeforeEach
  void setUp() {
    service = new CctvDetectionService(
        incidentRepository, aiJudgmentLogRepository, incidentNumberGenerator, deviceService, eventPublisher);
  }

  @Test
  void CCTV_감지_시_incident를_AI_SUSPECTED로_저장하고_선제적_드론_정찰_이벤트를_발행한다() {
    UUID organizationId = UUID.randomUUID();
    UUID cameraId = UUID.randomUUID();
    when(deviceService.get(cameraId)).thenReturn(new DeviceResponse(
        cameraId, organizationId, "CCTV", "CAM-001", "WIFI", null, null, null,
        new BigDecimal("37.5"), new BigDecimal("127.0"), null, "ACTIVE", null, LocalDateTime.now()));
    when(incidentNumberGenerator.next()).thenReturn("2026-0001");

    CctvDetectionRequest request = new CctvDetectionRequest(
        cameraId, null, new BigDecimal("87.5"), new BigDecimal("70"), "연기 감지", LocalDateTime.now(), null);

    UUID incidentId = service.receiveDetection(request, "AUTO");

    ArgumentCaptor<CctvSuspectedDetectedEvent> captor = ArgumentCaptor.forClass(CctvSuspectedDetectedEvent.class);
    org.mockito.Mockito.verify(eventPublisher).publishEvent(captor.capture());
    assertThat(captor.getValue().incidentId()).isEqualTo(incidentId);
  }
}

package com.faind.domain.incident.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.faind.domain.device.service.DeviceService;
import com.faind.domain.incident.entity.DroneDispatch;
import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentType;
import com.faind.domain.incident.repository.AiJudgmentLogRepository;
import com.faind.domain.incident.repository.DroneDispatchRepository;
import com.faind.domain.incident.repository.IncidentRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

// 멀티테넌시 1단계 회귀 방지: FR-27 골든타임 통계가 호출한 조직의 출동에 배정된 드론만
// 평균에 넣어야 한다 — 다른 조직의 드론 도착시간이 섞여 들어가면 안 된다.
@ExtendWith(MockitoExtension.class)
class DroneDispatchServiceTest {

  private static final UUID ORG_A = UUID.randomUUID();
  private static final UUID ORG_B = UUID.randomUUID();

  @Mock private IncidentRepository incidentRepository;
  @Mock private DroneDispatchRepository droneDispatchRepository;
  @Mock private AiJudgmentLogRepository aiJudgmentLogRepository;
  @Mock private DeviceService deviceService;
  @Mock private RoutingApiClient routingApiClient;

  private DroneDispatchService service;

  @BeforeEach
  void setUp() {
    service =
        new DroneDispatchService(incidentRepository, droneDispatchRepository, aiJudgmentLogRepository, deviceService, routingApiClient);
  }

  private Incident incident(UUID organizationId, LocalDateTime reportedAt) {
    return Incident.manualReport(
        organizationId, "2026-0001", IncidentType.FIRE, "주소", null, null, reportedAt, UUID.randomUUID());
  }

  private DroneDispatch arrivedDispatch(UUID incidentId) {
    DroneDispatch dispatch = new DroneDispatch(incidentId, UUID.randomUUID());
    dispatch.markOnSite(null);
    return dispatch;
  }

  @Test
  void 다른_조직_출동에_배정된_드론의_도착시간은_평균에서_제외한다() {
    UUID incidentAId = UUID.randomUUID();
    UUID incidentBId = UUID.randomUUID();
    DroneDispatch dispatchA = arrivedDispatch(incidentAId);
    DroneDispatch dispatchB = arrivedDispatch(incidentBId);
    when(droneDispatchRepository.findAll()).thenReturn(List.of(dispatchA, dispatchB));
    // ORG_A는 30초 전 신고(도착까지 30초), ORG_B는 1시간 전 신고 — ORG_B가 잘못 섞이면
    // 평균이 수천 초대로 튀어 오르므로, 평균이 여전히 짧은지로 실제 필터링 여부를 검증한다.
    when(incidentRepository.findById(incidentAId))
        .thenReturn(Optional.of(incident(ORG_A, LocalDateTime.now().minusSeconds(30))));
    when(incidentRepository.findById(incidentBId))
        .thenReturn(Optional.of(incident(ORG_B, LocalDateTime.now().minusHours(1))));

    var result = service.averageDroneArrivalSeconds(ORG_A);

    assertThat(result).isPresent();
    assertThat(result.getAsDouble()).isLessThan(60);
  }

  @Test
  void 같은_조직_출동만_있으면_그대로_평균에_들어간다() {
    UUID incidentId = UUID.randomUUID();
    DroneDispatch dispatch = arrivedDispatch(incidentId);
    when(droneDispatchRepository.findAll()).thenReturn(List.of(dispatch));
    when(incidentRepository.findById(incidentId))
        .thenReturn(Optional.of(incident(ORG_A, LocalDateTime.now().minusMinutes(5))));

    assertThat(service.averageDroneArrivalSeconds(ORG_A)).isPresent();
  }

  @Test
  void 호출한_조직의_출동이_하나도_없으면_평균이_비어있다() {
    UUID incidentId = UUID.randomUUID();
    DroneDispatch dispatch = arrivedDispatch(incidentId);
    when(droneDispatchRepository.findAll()).thenReturn(List.of(dispatch));
    when(incidentRepository.findById(incidentId))
        .thenReturn(Optional.of(incident(ORG_B, LocalDateTime.now().minusMinutes(5))));

    assertThat(service.averageDroneArrivalSeconds(ORG_A)).isEmpty();
  }

  // 선제적 드론 배정(CCTV 감지 시점) + confirm() 시점의 기존 IncidentCreatedEvent가 같은
  // incidentId로 autoDispatch()를 두 번 트리거할 수 있다 — 두 번째 호출은 조용히 건너뛰어야 한다.
  @Test
  void 이미_드론이_배정된_사건은_다시_자동배정하지_않는다() {
    UUID incidentId = UUID.randomUUID();
    when(droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId))
        .thenReturn(List.of(new DroneDispatch(incidentId, UUID.randomUUID())));

    var result = service.autoDispatch(incidentId);

    assertThat(result).isEmpty();
    verify(deviceService, never()).findNearestAvailableDrone(any(), any(), any());
    verify(incidentRepository, never()).findById(any());
  }
}

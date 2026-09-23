package com.faind.domain.incident.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.faind.domain.device.dto.DroneLocationResponse;
import com.faind.domain.device.dto.NearestDroneResponse;
import com.faind.domain.device.service.DeviceService;
import com.faind.domain.incident.entity.DroneDispatch;
import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentType;
import com.faind.domain.incident.repository.AiJudgmentLogRepository;
import com.faind.domain.incident.repository.DroneDispatchRepository;
import com.faind.domain.incident.repository.IncidentRepository;
import com.faind.domain.noflyzone.service.NoFlyZoneService;
import com.faind.integration.publicdata.PublicDataApiAdapter;
import com.faind.integration.publicdata.WeatherSnapshot;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

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
  @Mock private PublicDataApiAdapter publicDataApiAdapter;
  @Mock private NoFlyZoneService noFlyZoneService;

  private DroneDispatchService service;

  @BeforeEach
  void setUp() {
    service = new DroneDispatchService(
        incidentRepository, droneDispatchRepository, aiJudgmentLogRepository, deviceService, routingApiClient,
        publicDataApiAdapter, noFlyZoneService, 10.0, 0.1);
  }

  private Incident incident(UUID organizationId, LocalDateTime reportedAt) {
    return Incident.manualReport(
        organizationId, "2026-0001", IncidentType.FIRE, "주소", null, null, reportedAt, UUID.randomUUID());
  }

  private Incident incidentWithCoordinates(UUID organizationId) {
    return Incident.manualReport(
        organizationId, "2026-0002", IncidentType.FIRE, "주소", new BigDecimal("37.5"), new BigDecimal("127.0"),
        LocalDateTime.now(), UUID.randomUUID());
  }

  private DroneDispatch arrivedDispatch(UUID incidentId) {
    DroneDispatch dispatch = new DroneDispatch(incidentId, UUID.randomUUID());
    dispatch.markOnSite(null);
    return dispatch;
  }

  private Incident incidentWithId(UUID incidentId, UUID organizationId) {
    Incident incident = incidentWithCoordinates(organizationId);
    ReflectionTestUtils.setField(incident, "incidentId", incidentId);
    return incident;
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

  // FAIND 사업계획서 비행 전 규제 체크: 목표 좌표가 비행금지구역 안이면 다른 조건과 무관하게 막는다.
  @Test
  void 목표_좌표가_비행금지구역_안이면_드론을_배정하지_않는다() {
    UUID incidentId = UUID.randomUUID();
    Incident incident = incidentWithCoordinates(ORG_A);
    when(droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId)).thenReturn(List.of());
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
    when(noFlyZoneService.isRestricted(incident.getLatitude(), incident.getLongitude())).thenReturn(true);

    var result = service.autoDispatch(incidentId);

    assertThat(result).isEmpty();
    verify(deviceService, never()).findNearestAvailableDrone(any(), any(), any());
    assertThat(incident.getDroneDispatchSkipReason()).isEqualTo("NO_FLY_ZONE");
  }

  // FAIND 사업계획서 비행 전 안전 게이트: "기상 조건이 안전 기준을 벗어나면 다른 조건을 다
  // 충족해도 출동을 보류한다."
  @Test
  void 풍속이_안전기준을_벗어나면_드론을_배정하지_않는다() {
    UUID incidentId = UUID.randomUUID();
    Incident incident = incidentWithCoordinates(ORG_A);
    when(droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId)).thenReturn(List.of());
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
    when(publicDataApiAdapter.fetchCurrentWeather(incident.getLatitude(), incident.getLongitude()))
        .thenReturn(Optional.of(new WeatherSnapshot(15.0, 0.0)));

    var result = service.autoDispatch(incidentId);

    assertThat(result).isEmpty();
    verify(deviceService, never()).findNearestAvailableDrone(any(), any(), any());
    assertThat(incident.getDroneDispatchSkipReason()).isEqualTo("UNSAFE_WEATHER");
  }

  @Test
  void 강수량이_안전기준을_벗어나면_드론을_배정하지_않는다() {
    UUID incidentId = UUID.randomUUID();
    Incident incident = incidentWithCoordinates(ORG_A);
    when(droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId)).thenReturn(List.of());
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
    when(publicDataApiAdapter.fetchCurrentWeather(incident.getLatitude(), incident.getLongitude()))
        .thenReturn(Optional.of(new WeatherSnapshot(2.0, 3.0)));

    var result = service.autoDispatch(incidentId);

    assertThat(result).isEmpty();
    verify(deviceService, never()).findNearestAvailableDrone(any(), any(), any());
    assertThat(incident.getDroneDispatchSkipReason()).isEqualTo("UNSAFE_WEATHER");
  }

  // 기상 게이트는 핵심 배차 로직의 가용성을 해치면 안 되는 부가 안전장치다 — 관측을 못 가져와도
  // 배정 자체는 계속 진행돼야 한다(이후 단계에서 다른 이유로 막힐 수는 있다).
  @Test
  void 기상_관측을_가져올_수_없으면_배정을_막지_않는다() {
    UUID incidentId = UUID.randomUUID();
    Incident incident = incidentWithCoordinates(ORG_A);
    when(droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId)).thenReturn(List.of());
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
    when(publicDataApiAdapter.fetchCurrentWeather(incident.getLatitude(), incident.getLongitude()))
        .thenReturn(Optional.empty());
    when(deviceService.findNearestAvailableDrone(any(), any(), any())).thenReturn(Optional.<NearestDroneResponse>empty());

    service.autoDispatch(incidentId);

    verify(deviceService).findNearestAvailableDrone(any(), any(), any());
    assertThat(incident.getDroneDispatchSkipReason()).isEqualTo("NO_DRONE_AVAILABLE");
  }

  // CMD-001/002가 "왜 드론이 안 떴는지" 보여줄 수 있어야 한다 — 이전엔 로그만 남고 흔적이 없었다.
  @Test
  void 실제로_드론이_배정되면_이전에_남아있던_스킵_사유를_지운다() {
    UUID incidentId = UUID.randomUUID();
    Incident incident = incidentWithCoordinates(ORG_A);
    incident.recordDroneDispatchSkipped("UNSAFE_WEATHER");
    NearestDroneResponse drone = new NearestDroneResponse(UUID.randomUUID(), new BigDecimal("37.5"), new BigDecimal("127.0"), "DRONE-001");
    when(droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId)).thenReturn(List.of());
    when(incidentRepository.findById(incidentId)).thenReturn(Optional.of(incident));
    when(publicDataApiAdapter.fetchCurrentWeather(incident.getLatitude(), incident.getLongitude())).thenReturn(Optional.empty());
    when(deviceService.findNearestAvailableDrone(any(), any(), any())).thenReturn(Optional.of(drone));
    when(deviceService.claimDroneForDispatch(drone.droneId())).thenReturn(true);
    when(routingApiClient.estimateDroneRoute(any(), any(), any(), any(), any(), any()))
        .thenReturn(new com.faind.domain.incident.dto.RouteEstimateResponse(new BigDecimal("1.0"), 60, "테스트 출발지"));

    var result = service.autoDispatch(incidentId);

    assertThat(result).isPresent();
    assertThat(incident.getDroneDispatchSkipReason()).isNull();
  }

  // Firefly GCS 라이트 지도 뷰
  @Test
  void 배차중인_드론이_없으면_빈_목록을_반환한다() {
    when(droneDispatchRepository.findByStatusInOrderByDispatchedAtDesc(List.of("EN_ROUTE", "ON_SITE")))
        .thenReturn(List.of());

    var result = service.listActiveDispatches(ORG_A);

    assertThat(result).isEmpty();
    verify(incidentRepository, never()).findAllById(any());
  }

  @Test
  void 다른_조직의_출동은_지도에서_제외한다() {
    UUID incidentId = UUID.randomUUID();
    DroneDispatch dispatch = new DroneDispatch(incidentId, UUID.randomUUID());
    when(droneDispatchRepository.findByStatusInOrderByDispatchedAtDesc(List.of("EN_ROUTE", "ON_SITE")))
        .thenReturn(List.of(dispatch));
    when(incidentRepository.findAllById(any())).thenReturn(List.of(incidentWithId(incidentId, ORG_B)));
    when(deviceService.findDroneLocations(any())).thenReturn(Map.of());

    var result = service.listActiveDispatches(ORG_A);

    assertThat(result).isEmpty();
  }

  @Test
  void 배차중인_드론_위치와_목표_좌표를_함께_반환한다() {
    UUID incidentId = UUID.randomUUID();
    UUID droneId = UUID.randomUUID();
    DroneDispatch dispatch = new DroneDispatch(incidentId, droneId);
    Incident incident = incidentWithId(incidentId, ORG_A);
    DroneLocationResponse droneLocation =
        new DroneLocationResponse(droneId, "DRONE-001", new BigDecimal("37.6"), new BigDecimal("127.1"), 72, "DISPATCHED");
    when(droneDispatchRepository.findByStatusInOrderByDispatchedAtDesc(List.of("EN_ROUTE", "ON_SITE")))
        .thenReturn(List.of(dispatch));
    when(incidentRepository.findAllById(any())).thenReturn(List.of(incident));
    when(deviceService.findDroneLocations(any())).thenReturn(Map.of(droneId, droneLocation));

    var result = service.listActiveDispatches(ORG_A);

    assertThat(result).hasSize(1);
    var response = result.get(0);
    assertThat(response.incidentId()).isEqualTo(incidentId);
    assertThat(response.targetLatitude()).isEqualTo(incident.getLatitude());
    assertThat(response.droneId()).isEqualTo(droneId);
    assertThat(response.droneSerialNo()).isEqualTo("DRONE-001");
    assertThat(response.droneLatitude()).isEqualTo(new BigDecimal("37.6"));
    assertThat(response.droneBatteryLevel()).isEqualTo(72);
  }
}

package com.faind.domain.incident.service;

import com.faind.domain.device.dto.NearestDroneResponse;
import com.faind.domain.device.service.DeviceService;
import com.faind.domain.incident.dto.DroneDispatchResponse;
import com.faind.domain.incident.dto.RouteEstimateResponse;
import com.faind.domain.incident.entity.AiJudgmentLog;
import com.faind.domain.incident.entity.DroneDispatch;
import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.repository.AiJudgmentLogRepository;
import com.faind.domain.incident.repository.DroneDispatchRepository;
import com.faind.domain.incident.repository.IncidentRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.integration.publicdata.PublicDataApiAdapter;
import com.faind.integration.publicdata.WeatherSnapshot;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.OptionalDouble;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-25/26: incident가 DISPATCHED로 확정되는 즉시 가장 가까운 드론을 자동 배정하고,
// 드론이 현장에서 보내는 정찰 결과를 ai_judgment_logs(DRONE_RECON)로 적재한다.
@Service
public class DroneDispatchService {

  private static final Logger log = LoggerFactory.getLogger(DroneDispatchService.class);

  private final IncidentRepository incidentRepository;
  private final DroneDispatchRepository droneDispatchRepository;
  private final AiJudgmentLogRepository aiJudgmentLogRepository;
  private final DeviceService deviceService;
  private final RoutingApiClient routingApiClient;
  private final PublicDataApiAdapter publicDataApiAdapter;
  private final double maxWindSpeedMs;
  private final double maxPrecipitationMm;

  public DroneDispatchService(
      IncidentRepository incidentRepository,
      DroneDispatchRepository droneDispatchRepository,
      AiJudgmentLogRepository aiJudgmentLogRepository,
      DeviceService deviceService,
      RoutingApiClient routingApiClient,
      PublicDataApiAdapter publicDataApiAdapter,
      @Value("${faind.drone.weather-safety.max-wind-speed-ms:10.0}") double maxWindSpeedMs,
      @Value("${faind.drone.weather-safety.max-precipitation-mm:0.1}") double maxPrecipitationMm) {
    this.incidentRepository = incidentRepository;
    this.droneDispatchRepository = droneDispatchRepository;
    this.aiJudgmentLogRepository = aiJudgmentLogRepository;
    this.deviceService = deviceService;
    this.routingApiClient = routingApiClient;
    this.publicDataApiAdapter = publicDataApiAdapter;
    this.maxWindSpeedMs = maxWindSpeedMs;
    this.maxPrecipitationMm = maxPrecipitationMm;
  }

  // REQUIRES_NEW: IncidentCreatedListener(AFTER_COMMIT)에서 호출 — 이유는 IncidentService.savePreAnalysisResult 주석 참조.
  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
  public Optional<DroneDispatchResponse> autoDispatch(UUID incidentId) {
    // 멱등성 가드: CCTV로 감지된 사건은 CctvSuspectedDetectedEvent(AI_SUSPECTED, 선제적 정찰)에서
    // 한 번, 관리자가 confirm()할 때 IncidentCreatedEvent에서 또 한 번 — 이 메서드가 같은
    // incidentId로 두 번 호출될 수 있다. 이미 배정 이력이 있으면 드론을 중복으로 띄우지 않는다.
    if (!droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId).isEmpty()) {
      log.info("이미 드론이 배정된 사건이라 FR-25 자동배정을 건너뜁니다 (incidentId={})", incidentId);
      return Optional.empty();
    }

    Incident incident = incidentRepository.findById(incidentId)
        .orElseThrow(() -> new BusinessException(ErrorCode.INCIDENT_NOT_FOUND));

    // FAIND 사업계획서 비행 전 안전 게이트: 기상 조건이 안전 기준을 벗어나면 다른 조건을 다
    // 충족해도 출동을 보류한다. 관측 자체를 못 가져온 경우(서비스키 미설정, API 실패 등)는
    // "위험하다고 판단할 근거가 없다"로 보고 배정을 막지 않는다 — 이 게이트는 핵심 배차 로직의
    // 가용성을 해치면 안 되는 부가 안전장치이기 때문이다.
    Optional<WeatherSnapshot> weather =
        publicDataApiAdapter.fetchCurrentWeather(incident.getLatitude(), incident.getLongitude());
    if (weather.isPresent() && isUnsafeToFly(weather.get())) {
      log.info(
          "기상 조건이 비행 안전 기준을 벗어나 FR-25 자동배정을 보류합니다 (incidentId={}, windSpeedMs={}, precipitationMm={})",
          incidentId, weather.get().windSpeedMs(), weather.get().precipitationMm());
      return Optional.empty();
    }

    Optional<NearestDroneResponse> nearestDrone = deviceService.findNearestAvailableDrone(
        incident.getOrganizationId(), incident.getLatitude(), incident.getLongitude());
    if (nearestDrone.isEmpty()) {
      log.info("배정 가능한 드론이 없어 FR-25 자동배정을 건너뜁니다 (incidentId={})", incidentId);
      return Optional.empty();
    }

    NearestDroneResponse drone = nearestDrone.get();
    if (!deviceService.claimDroneForDispatch(drone.droneId())) {
      // 후보를 고른 뒤 선점하는 사이 다른 출동이 같은 드론을 먼저 가져간 경우(동시 배차 경합) —
      // 이번 배정은 건너뛴다. 드물게라도 실제로 겪을 수 있는 경합이라 조용히 무시하지 않고 로그를 남긴다.
      log.info("드론이 동시 배차 경합으로 이미 선점되어 자동배정을 건너뜁니다 (incidentId={}, droneId={})", incidentId, drone.droneId());
      return Optional.empty();
    }
    DroneDispatch dispatch = new DroneDispatch(incidentId, drone.droneId());
    droneDispatchRepository.save(dispatch);

    RouteEstimateResponse route = routingApiClient.estimateDroneRoute(
        incidentId.toString(), drone.latitude(), drone.longitude(), incident.getLatitude(), incident.getLongitude(),
        drone.stationLabel());
    log.info(
        "드론 자동배정 완료: incidentId={}, droneId={}, distanceKm={}, etaSeconds={}",
        incidentId, drone.droneId(), route.distanceKm(), route.etaSeconds());

    return Optional.of(DroneDispatchResponse.from(dispatch));
  }

  private boolean isUnsafeToFly(WeatherSnapshot weather) {
    return weather.windSpeedMs() > maxWindSpeedMs || weather.precipitationMm() > maxPrecipitationMm;
  }

  // FR-26: 드론 도착 후 정찰 영상을 AI가 분석한 결과를 CMD-002에 표시하기 위해 기록.
  @Transactional
  public void recordReconResult(UUID dispatchId, BigDecimal confidenceScore, String summary, String videoRef) {
    DroneDispatch dispatch = droneDispatchRepository.findById(dispatchId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "드론 출동 이력을 찾을 수 없습니다."));
    dispatch.markOnSite(videoRef);
    aiJudgmentLogRepository.save(
        new AiJudgmentLog("DRONE_RECON", dispatch.getIncidentId(), null, dispatch.getDroneId(), confidenceScore, summary));
  }

  // FR-25: 출동이 종료(IncidentClosedListener, AFTER_COMMIT)되면 그 출동에 배정됐던 드론들을 전부
  // 배차 가능 상태로 되돌린다 — 이걸 안 하면 그 드론이 영원히 DISPATCHED로 남아 이후 어떤 출동에도
  // 다시 자동배정될 수 없다. REQUIRES_NEW: autoDispatch()와 같은 이유(IncidentService.
  // savePreAnalysisResult 주석 참조) — AFTER_COMMIT 콜백에서 기본 REQUIRED로 걸면 이미 끝나가는
  // 트랜잭션에 합류만 하고 실제 커밋이 조용히 유실된다.
  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
  public void releaseDronesForIncident(UUID incidentId) {
    List<DroneDispatch> dispatches = droneDispatchRepository.findByIncidentIdOrderByDispatchedAtDesc(incidentId);
    for (DroneDispatch dispatch : dispatches) {
      deviceService.releaseDrone(dispatch.getDroneId());
    }
  }

  // FR-27: ADM-009 골든타임 단축효과 — "드론 활용 시 현장 최초 도착" 평균값의 소스.
  // drone_dispatches는 organization_id가 없다 — incident_id를 통해 매번 조회한 incident의
  // organizationId로 걸러낸다(호출자 조직 외 출동은 애초에 평균에 넣지 않는다).
  public OptionalDouble averageDroneArrivalSeconds(UUID organizationId) {
    List<DroneDispatch> arrived = droneDispatchRepository.findAll().stream()
        .filter(d -> d.getArrivedAt() != null)
        .toList();
    if (arrived.isEmpty()) {
      return OptionalDouble.empty();
    }
    return arrived.stream()
        .mapToLong(d -> {
          Incident incident = incidentRepository.findById(d.getIncidentId()).orElse(null);
          if (incident == null || !incident.getOrganizationId().equals(organizationId)) {
            return -1;
          }
          return Duration.between(incident.getReportedAt(), d.getArrivedAt()).getSeconds();
        })
        .filter(seconds -> seconds >= 0)
        .average();
  }
}

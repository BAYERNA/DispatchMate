package com.faind.domain.device.service;

import com.faind.domain.auth.dto.AccountResponse;
import com.faind.domain.auth.service.AccountService;
import com.faind.domain.device.dto.CameraResponse;
import com.faind.domain.device.dto.DeviceRequest;
import com.faind.domain.device.dto.DeviceResponse;
import com.faind.domain.device.dto.NearestDroneResponse;
import com.faind.domain.device.entity.Device;
import com.faind.domain.device.entity.DeviceType;
import com.faind.domain.device.repository.DeviceRepository;
import com.faind.domain.device.repository.DeviceSpecifications;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.global.util.GeoUtil;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-11 기기 등록·매핑 (ADM-006). QA 재검증 대상이었던 "등록 트랜잭션과 매핑 트랜잭션 분리" 결함을
// register()가 device 생성 + 매핑을 한 트랜잭션 안에서 처리하도록 고쳐서 해소한다.
// FR-24: CCTV/드론은 device_type만 다를 뿐 같은 등록 화면·API를 재사용하되, 대원 매핑 대신 좌표를 요구한다.
@Service
@Transactional(readOnly = true)
public class DeviceService {

  private final DeviceRepository deviceRepository;
  private final AccountService accountService;

  public DeviceService(DeviceRepository deviceRepository, AccountService accountService) {
    this.deviceRepository = deviceRepository;
    this.accountService = accountService;
  }

  public Page<DeviceResponse> list(UUID organizationId, String keyword, String deviceTypeParam, Pageable pageable) {
    DeviceType deviceType = parseType(deviceTypeParam);
    List<UUID> matchedUserIds = accountService.findUserIdsByKeyword(organizationId, keyword);
    Page<Device> devices = deviceRepository.findAll(
        DeviceSpecifications.search(organizationId, keyword, deviceType, matchedUserIds), pageable);
    return enrich(devices);
  }

  // CctvDetectionService처럼 로그인 사용자가 없는 내부 호출 경로에서도 카메라 조회가 필요해
  // organizationId로 스코프하지 않는다 — 응답에 담긴 organizationId 자체가 호출부의 신뢰 근거가 된다.
  // 관리자 화면(컨트롤러) 쪽 조회는 getForOrganization()을 대신 쓴다.
  public DeviceResponse get(UUID deviceId) {
    Device device = findDevice(deviceId);
    Map<UUID, AccountResponse> accounts =
        device.getCurrentUserId() == null
            ? Map.of()
            : accountService.findAccountsByIds(List.of(device.getCurrentUserId()));
    return toResponse(device, accounts);
  }

  public DeviceResponse getForOrganization(UUID organizationId, UUID deviceId) {
    DeviceResponse response = get(deviceId);
    if (!response.organizationId().equals(organizationId)) {
      throw new BusinessException(ErrorCode.DEVICE_NOT_FOUND);
    }
    return response;
  }

  @Transactional
  public DeviceResponse register(UUID organizationId, DeviceRequest request) {
    DeviceType deviceType = parseType(request.deviceType());
    if (deviceRepository.existsBySerialNo(request.serialNo())) {
      throw new BusinessException(ErrorCode.DUPLICATE_SERIAL_NO);
    }

    UUID mappedUserId = null;
    BigDecimal latitude = null;
    BigDecimal longitude = null;

    if (deviceType.isPersonalDevice()) {
      mappedUserId = request.currentUserId();
    } else if (deviceType.isFixedLocationAsset()) {
      if (request.latitude() == null || request.longitude() == null) {
        throw new BusinessException(ErrorCode.INVALID_INPUT, "CCTV/드론은 설치 위치 좌표가 필수입니다.");
      }
      latitude = request.latitude();
      longitude = request.longitude();
    }

    String streamUrl = deviceType.isFixedLocationAsset() ? request.streamUrl() : null;

    // 등록(row 생성)과 매핑(current_user_id 설정)이 같은 save 호출, 같은 트랜잭션 안에서 실행된다.
    Device device = new Device(
        organizationId, deviceType, request.serialNo(), request.connectionType(), mappedUserId, latitude, longitude,
        request.batteryLevel(), streamUrl);
    deviceRepository.save(device);
    return get(device.getDeviceId());
  }

  @Transactional
  public DeviceResponse relocate(UUID organizationId, UUID deviceId, BigDecimal latitude, BigDecimal longitude) {
    Device device = findDevice(organizationId, deviceId);
    device.relocate(latitude, longitude);
    return get(deviceId);
  }

  @Transactional
  public DeviceResponse updateStreamUrl(UUID organizationId, UUID deviceId, String streamUrl) {
    Device device = findDevice(organizationId, deviceId);
    device.updateStreamUrl(streamUrl);
    return get(deviceId);
  }

  // CMD-002 라이브 카메라 선택 드롭다운(FR-24/26) - COMMANDER도 접근 가능해야 하므로 대원 매핑
  // 정보 없이 카메라 목록만 좁게 반환한다.
  public List<CameraResponse> listCameras(UUID organizationId) {
    return deviceRepository.findByOrganizationIdAndDeviceType(organizationId, DeviceType.CCTV).stream()
        .map(CameraResponse::from)
        .toList();
  }

  private Page<DeviceResponse> enrich(Page<Device> devices) {
    List<UUID> userIds = devices.stream().map(Device::getCurrentUserId).filter(java.util.Objects::nonNull).toList();
    Map<UUID, AccountResponse> accounts = accountService.findAccountsByIds(userIds);
    return devices.map(device -> toResponse(device, accounts));
  }

  private DeviceResponse toResponse(Device device, Map<UUID, AccountResponse> accounts) {
    // CCTV/드론은 currentUserId가 null(§3.2)이라, Map.of() 같은 불변 빈 맵에 null 키로 get()하면
    // NPE가 난다(Map.of()는 null 키를 즉시 거부). 대원 매핑이 없는 기기는 조회 자체를 건너뛴다.
    if (device.getCurrentUserId() == null) {
      return DeviceResponse.from(device);
    }
    AccountResponse mapped = accounts.get(device.getCurrentUserId());
    if (mapped == null) {
      return DeviceResponse.from(device);
    }
    return DeviceResponse.from(device, mapped.name(), mapped.team());
  }

  // FR-25: incident 패키지가 드론 자동배정 시 호출. status='NORMAL'인 드론 중 현장에서 가장 가까운 1대.
  // organizationId로 스코프해 다른 조직의 드론이 잘못 배정되지 않도록 한다(멀티테넌시 1단계).
  public Optional<NearestDroneResponse> findNearestAvailableDrone(
      UUID organizationId, BigDecimal targetLat, BigDecimal targetLng) {
    if (targetLat == null || targetLng == null) {
      return Optional.empty();
    }
    return deviceRepository.findByOrganizationIdAndDeviceTypeAndStatus(organizationId, DeviceType.DRONE, "NORMAL")
        .stream()
        .filter(d -> d.getLatitude() != null && d.getLongitude() != null)
        .min(Comparator.comparingDouble(d -> GeoUtil.haversineKm(
            d.getLatitude().doubleValue(), d.getLongitude().doubleValue(), targetLat.doubleValue(), targetLng.doubleValue())))
        .map(d -> new NearestDroneResponse(d.getDeviceId(), d.getLatitude(), d.getLongitude(), d.getSerialNo()));
  }

  // FR-25: findNearestAvailableDrone()으로 후보를 고른 뒤 이걸로 선점을 확정한다. DB의 원자적
  // UPDATE...WHERE로 처리해서, 두 출동이 동시에 같은 드론을 고르는 경합을 막는다 — 실패(false)면
  // 그사이 다른 출동이 먼저 선점한 것이므로 호출부가 이번 배정을 건너뛴다.
  @Transactional
  public boolean claimDroneForDispatch(UUID droneId) {
    return deviceRepository.claimForDispatch(droneId) > 0;
  }

  // FR-25: 출동이 종료되면 그 출동에 배정됐던 드론들을 다시 배차 가능(NORMAL) 상태로 되돌린다.
  @Transactional
  public void releaseDrone(UUID droneId) {
    deviceRepository.findById(droneId).ifPresent(d -> d.updateStatus("NORMAL", d.getBatteryLevel()));
  }

  // ADM-001 관리자 홈(FR-09) "기기 이상" 카드.
  public long countAnomalies(UUID organizationId) {
    return deviceRepository.countByOrganizationIdAndStatusIn(organizationId, List.of("WARNING", "DISCONNECTED"));
  }

  private Device findDevice(UUID deviceId) {
    return deviceRepository.findById(deviceId).orElseThrow(() -> new BusinessException(ErrorCode.DEVICE_NOT_FOUND));
  }

  // 쓰기 경로(위치·스트림 URL 변경)는 조직 경계를 반드시 확인해야 하므로 이 스코프된 버전을 쓴다.
  private Device findDevice(UUID organizationId, UUID deviceId) {
    Device device = findDevice(deviceId);
    if (!device.getOrganizationId().equals(organizationId)) {
      throw new BusinessException(ErrorCode.DEVICE_NOT_FOUND);
    }
    return device;
  }

  private DeviceType parseType(String deviceTypeParam) {
    if (deviceTypeParam == null || deviceTypeParam.isBlank() || "ALL".equalsIgnoreCase(deviceTypeParam)) {
      return null;
    }
    try {
      return DeviceType.valueOf(deviceTypeParam.toUpperCase());
    } catch (IllegalArgumentException e) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 기기 유형입니다: " + deviceTypeParam);
    }
  }
}

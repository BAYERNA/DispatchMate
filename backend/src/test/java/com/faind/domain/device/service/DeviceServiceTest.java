package com.faind.domain.device.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.faind.domain.auth.service.AccountService;
import com.faind.domain.device.entity.Device;
import com.faind.domain.device.entity.DeviceType;
import com.faind.domain.device.repository.DeviceRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

// 멀티테넌시 1단계(V17) 회귀 방지: 다른 조직의 device_id를 알거나 추측해도 조회·위치변경·
// 스트림 URL 변경이 되지 않아야 한다는 것을 검증한다.
@ExtendWith(MockitoExtension.class)
class DeviceServiceTest {

  private static final UUID ORG_A = UUID.randomUUID();
  private static final UUID ORG_B = UUID.randomUUID();

  @Mock private DeviceRepository deviceRepository;
  @Mock private AccountService accountService;

  private DeviceService deviceService;

  @BeforeEach
  void setUp() {
    deviceService = new DeviceService(deviceRepository, accountService);
  }

  private Device cctvInOrgB(UUID deviceId) {
    Device device = new Device(
        ORG_B, DeviceType.CCTV, "SN-001", null, null, new BigDecimal("37.5"), new BigDecimal("127.0"), null, null);
    ReflectionTestUtils.setField(device, "deviceId", deviceId);
    return device;
  }

  @Test
  void 다른_조직의_기기는_조회할_수_없다() {
    UUID deviceId = UUID.randomUUID();
    when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(cctvInOrgB(deviceId)));

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class, () -> deviceService.getForOrganization(ORG_A, deviceId));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.DEVICE_NOT_FOUND);
  }

  @Test
  void 다른_조직의_기기는_위치를_변경할_수_없다() {
    UUID deviceId = UUID.randomUUID();
    when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(cctvInOrgB(deviceId)));

    assertThatThrownBy(() -> deviceService.relocate(ORG_A, deviceId, BigDecimal.ONE, BigDecimal.ONE))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 다른_조직의_기기는_스트림_URL을_변경할_수_없다() {
    UUID deviceId = UUID.randomUUID();
    when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(cctvInOrgB(deviceId)));

    assertThatThrownBy(() -> deviceService.updateStreamUrl(ORG_A, deviceId, "rtsp://new"))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 같은_조직의_기기는_정상_조회된다() {
    UUID deviceId = UUID.randomUUID();
    Device device = new Device(
        ORG_A, DeviceType.CCTV, "SN-002", null, null, new BigDecimal("37.5"), new BigDecimal("127.0"), null, null);
    ReflectionTestUtils.setField(device, "deviceId", deviceId);
    when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(device));

    var response = deviceService.getForOrganization(ORG_A, deviceId);

    assertThat(response.deviceId()).isEqualTo(deviceId);
    assertThat(response.organizationId()).isEqualTo(ORG_A);
  }

  // Firefly GCS 라이트 지도 뷰: 드론 좌표를 한 번에 조회할 때, 이미 삭제됐거나 못 찾은 드론 id는
  // 결과 맵에서 그냥 빠져야 한다(호출부가 null로 방어하는 전제).
  @Test
  void 드론_위치를_id_목록으로_한번에_조회한다() {
    UUID droneId = UUID.randomUUID();
    Device drone = new Device(
        ORG_A, DeviceType.DRONE, "DRONE-001", null, null, new BigDecimal("37.5"), new BigDecimal("127.0"), 80, null);
    ReflectionTestUtils.setField(drone, "deviceId", droneId);
    UUID missingId = UUID.randomUUID();
    when(deviceRepository.findAllById(List.of(droneId, missingId))).thenReturn(List.of(drone));

    var result = deviceService.findDroneLocations(List.of(droneId, missingId));

    assertThat(result).hasSize(1);
    assertThat(result.get(droneId).serialNo()).isEqualTo("DRONE-001");
    assertThat(result.get(droneId).batteryLevel()).isEqualTo(80);
    assertThat(result).doesNotContainKey(missingId);
  }
}

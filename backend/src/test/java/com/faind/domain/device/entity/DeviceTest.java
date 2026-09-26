package com.faind.domain.device.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

// 전체 점검(security audit)에서 발견한 결함의 회귀 방지: 기기 유형 불일치 시 던지는
// IllegalStateException이 GlobalExceptionHandler에서 500이 아니라 400으로 매핑되는지는
// 별도(웹 계층) 관심사고, 여기서는 그 예외가 "언제" 발생해야 하는지(도메인 규칙)를 검증한다.
class DeviceTest {

  private Device newDevice(DeviceType type) {
    return new Device(java.util.UUID.randomUUID(), type, "SN-001", null, null, null, null, null, null);
  }

  @Test
  void CCTV는_스트림_주소를_등록할_수_있다() {
    Device cctv = newDevice(DeviceType.CCTV);

    cctv.updateStreamUrl("rtsp://example.com/stream");

    assertThat(cctv.getStreamUrl()).isEqualTo("rtsp://example.com/stream");
  }

  @Test
  void 웨어러블_기기는_스트림_주소를_등록할_수_없다() {
    Device bodycam = newDevice(DeviceType.BODYCAM);

    assertThatThrownBy(() -> bodycam.updateStreamUrl("rtsp://example.com/stream"))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void CCTV_드론은_대원에게_매핑할_수_없다() {
    Device drone = newDevice(DeviceType.DRONE);

    assertThatThrownBy(() -> drone.remap(java.util.UUID.randomUUID()))
        .isInstanceOf(IllegalStateException.class);
  }

  @Test
  void 웨어러블_기기는_대원에게_매핑할_수_있다() {
    Device smartphone = newDevice(DeviceType.SMARTPHONE);
    var userId = java.util.UUID.randomUUID();

    smartphone.remap(userId);

    assertThat(smartphone.getCurrentUserId()).isEqualTo(userId);
  }

  @Test
  void 웨어러블_기기는_위치_좌표를_설정할_수_없다() {
    Device sensor = newDevice(DeviceType.SENSOR);

    assertThatThrownBy(() -> sensor.relocate(BigDecimal.ONE, BigDecimal.ONE))
        .isInstanceOf(IllegalStateException.class);
  }
}

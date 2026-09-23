package com.faind.domain.device.dto;

import com.faind.domain.device.entity.Device;
import java.math.BigDecimal;
import java.util.UUID;

// Firefly GCS 라이트 지도 뷰: 배차된 드론의 현재 좌표·배터리만 뽑은 것.
public record DroneLocationResponse(
    UUID droneId, String serialNo, BigDecimal latitude, BigDecimal longitude, Integer batteryLevel, String status) {

  public static DroneLocationResponse from(Device device) {
    return new DroneLocationResponse(
        device.getDeviceId(),
        device.getSerialNo(),
        device.getLatitude(),
        device.getLongitude(),
        device.getBatteryLevel(),
        device.getStatus());
  }
}

package com.faind.domain.device.dto;

import com.faind.domain.device.entity.Device;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record DeviceResponse(
    UUID deviceId,
    UUID organizationId,
    String deviceType,
    String serialNo,
    String connectionType,
    UUID currentUserId,
    String mappedUserName,
    String mappedUserTeam,
    BigDecimal latitude,
    BigDecimal longitude,
    String streamUrl,
    String status,
    Integer batteryLevel,
    LocalDateTime registeredAt) {

  public static DeviceResponse from(Device device) {
    return from(device, null, null);
  }

  public static DeviceResponse from(Device device, String mappedUserName, String mappedUserTeam) {
    return new DeviceResponse(
        device.getDeviceId(),
        device.getOrganizationId(),
        device.getDeviceType().name(),
        device.getSerialNo(),
        device.getConnectionType(),
        device.getCurrentUserId(),
        mappedUserName,
        mappedUserTeam,
        device.getLatitude(),
        device.getLongitude(),
        device.getStreamUrl(),
        device.getStatus(),
        device.getBatteryLevel(),
        device.getRegisteredAt());
  }
}

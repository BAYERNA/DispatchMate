package com.faind.domain.device.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

// DB설계서 §3.2 devices — 웨어러블/스마트폰과 CCTV/드론을 "기기"라는 동일 개념으로 재사용한다.
@Entity
@Table(name = "devices")
public class Device {

  @Id
  @GeneratedValue
  @UuidGenerator
  @Column(name = "device_id")
  private UUID deviceId;

  // 멀티테넌시 1단계(V17): 이 기기가 속한 조직. CCTV/드론 격리 판단의 근거가 되므로
  // CctvDetectionService처럼 로그인 사용자가 없는 내부 호출 경로에서도 이 값을 신뢰한다.
  @Column(name = "organization_id", nullable = false)
  private UUID organizationId;

  @Enumerated(EnumType.STRING)
  @Column(name = "device_type", nullable = false, length = 30)
  private DeviceType deviceType;

  @Column(name = "serial_no", nullable = false, unique = true, length = 50)
  private String serialNo;

  @Column(name = "connection_type", length = 20)
  private String connectionType; // BLE / LTE_5G / WIFI

  @Column(name = "current_user_id")
  private UUID currentUserId;

  @Column(precision = 9, scale = 6)
  private BigDecimal latitude;

  @Column(precision = 9, scale = 6)
  private BigDecimal longitude;

  // FR-24/26 실시간 영상 뷰(CMD-002) - CCTV/DRONE만 의미 있음. 웨어러블류는 항상 null.
  @Column(name = "stream_url", length = 500)
  private String streamUrl;

  @Column(nullable = false, length = 15)
  private String status = "NORMAL"; // NORMAL / WARNING / DISCONNECTED / DISPATCHED(드론 전용, FR-25 배차중)

  @Column(name = "battery_level")
  private Integer batteryLevel;

  @Column(name = "registered_at", nullable = false)
  private LocalDateTime registeredAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  protected Device() {}

  public Device(
      UUID organizationId,
      DeviceType deviceType,
      String serialNo,
      String connectionType,
      UUID currentUserId,
      BigDecimal latitude,
      BigDecimal longitude,
      Integer batteryLevel,
      String streamUrl) {
    this.organizationId = organizationId;
    this.deviceType = deviceType;
    this.serialNo = serialNo;
    this.connectionType = connectionType;
    this.currentUserId = currentUserId;
    this.latitude = latitude;
    this.longitude = longitude;
    this.batteryLevel = batteryLevel;
    this.streamUrl = streamUrl;
    this.status = "NORMAL";
    this.registeredAt = LocalDateTime.now();
  }

  // ADM-006 QA 재검증 대상 수정: 등록과 매핑이 서로 다른 트랜잭션이라 current_user_id가
  // 저장되지 않던 결함 — 이 메서드를 DeviceService가 "등록" 트랜잭션 안에서 바로 호출해
  // device row 생성과 매핑이 항상 같은 트랜잭션으로 커밋되도록 한다.
  public void remap(UUID newUserId) {
    if (!deviceType.isPersonalDevice()) {
      throw new IllegalStateException("CCTV/드론은 대원에게 매핑할 수 없습니다.");
    }
    this.currentUserId = newUserId;
    this.updatedAt = LocalDateTime.now();
  }

  public void relocate(BigDecimal newLatitude, BigDecimal newLongitude) {
    if (!deviceType.isFixedLocationAsset()) {
      throw new IllegalStateException("위치 좌표는 CCTV/드론 자산만 설정할 수 있습니다.");
    }
    this.latitude = newLatitude;
    this.longitude = newLongitude;
    this.updatedAt = LocalDateTime.now();
  }

  public void updateStreamUrl(String newStreamUrl) {
    if (!deviceType.isFixedLocationAsset()) {
      throw new IllegalStateException("스트림 주소는 CCTV/드론 자산만 설정할 수 있습니다.");
    }
    this.streamUrl = newStreamUrl;
    this.updatedAt = LocalDateTime.now();
  }

  public void updateStatus(String status, Integer batteryLevel) {
    this.status = status;
    this.batteryLevel = batteryLevel;
    this.updatedAt = LocalDateTime.now();
  }

  public UUID getDeviceId() {
    return deviceId;
  }

  public UUID getOrganizationId() {
    return organizationId;
  }

  public DeviceType getDeviceType() {
    return deviceType;
  }

  public String getSerialNo() {
    return serialNo;
  }

  public String getConnectionType() {
    return connectionType;
  }

  public UUID getCurrentUserId() {
    return currentUserId;
  }

  public BigDecimal getLatitude() {
    return latitude;
  }

  public BigDecimal getLongitude() {
    return longitude;
  }

  public String getStreamUrl() {
    return streamUrl;
  }

  public String getStatus() {
    return status;
  }

  public Integer getBatteryLevel() {
    return batteryLevel;
  }

  public LocalDateTime getRegisteredAt() {
    return registeredAt;
  }

  public LocalDateTime getUpdatedAt() {
    return updatedAt;
  }
}

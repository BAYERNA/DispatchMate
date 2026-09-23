package com.faind.domain.noflyzone.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

// 비행 전 규제 체크(FAIND 사업계획서): organizations와 무관한 공유 참조 데이터라 fire_risk_regions와
// 같은 이유로 organization_id를 두지 않는다. active=false인 구역은 게이트 판단에서 제외된다
// (해제된 규제 구역을 굳이 삭제하지 않고 이력으로 남겨둘 수 있도록).
@Entity
@Table(name = "no_fly_zones")
public class NoFlyZone {

  @Id
  @GeneratedValue
  @UuidGenerator
  @Column(name = "zone_id")
  private UUID zoneId;

  @Column(name = "zone_name", nullable = false, length = 100)
  private String zoneName;

  @Column(name = "zone_type", nullable = false, length = 30)
  private String zoneType;

  @Column(name = "center_latitude", nullable = false, precision = 9, scale = 6)
  private BigDecimal centerLatitude;

  @Column(name = "center_longitude", nullable = false, precision = 9, scale = 6)
  private BigDecimal centerLongitude;

  @Column(name = "radius_km", nullable = false, precision = 6, scale = 2)
  private BigDecimal radiusKm;

  @Column(nullable = false)
  private boolean active = true;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  protected NoFlyZone() {}

  public NoFlyZone(
      String zoneName, String zoneType, BigDecimal centerLatitude, BigDecimal centerLongitude, BigDecimal radiusKm) {
    this.zoneName = zoneName;
    this.zoneType = zoneType;
    this.centerLatitude = centerLatitude;
    this.centerLongitude = centerLongitude;
    this.radiusKm = radiusKm;
    this.active = true;
    this.createdAt = LocalDateTime.now();
  }

  public UUID getZoneId() {
    return zoneId;
  }

  public String getZoneName() {
    return zoneName;
  }

  public String getZoneType() {
    return zoneType;
  }

  public BigDecimal getCenterLatitude() {
    return centerLatitude;
  }

  public BigDecimal getCenterLongitude() {
    return centerLongitude;
  }

  public BigDecimal getRadiusKm() {
    return radiusKm;
  }

  public boolean isActive() {
    return active;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }
}

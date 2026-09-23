package com.faind.domain.firerisk.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;

// Fire Risk Score — 지역(시군구) 단위 화재 위험도. organizations와 무관한 공유 참조 데이터라
// organization_id를 두지 않는다(건축HUB/화재이력 공공데이터 연동과 같은 성격 — PublicDataApiAdapter 참조).
@Entity
@Table(name = "fire_risk_regions")
public class FireRiskRegion {

  @Id
  @Column(name = "region_code", length = 20)
  private String regionCode;

  @Column(name = "region_name", nullable = false, length = 100)
  private String regionName;

  @Column(name = "fire_count_5y", nullable = false)
  private int fireCount5y;

  @Column(name = "response_time_p90_seconds", nullable = false)
  private int responseTimeP90Seconds;

  @Column(name = "casualty_total", nullable = false)
  private int casualtyTotal;

  @Column(name = "night_fire_ratio", nullable = false)
  private BigDecimal nightFireRatio;

  @Column(name = "high_risk_structure_ratio", nullable = false)
  private BigDecimal highRiskStructureRatio;

  @Column(name = "negligence_fire_ratio", nullable = false)
  private BigDecimal negligenceFireRatio;

  @Column(name = "risk_score", nullable = false)
  private BigDecimal riskScore;

  @Column(name = "risk_grade", nullable = false, length = 4)
  private String riskGrade; // 상 / 중 / 하

  @Column(name = "computed_at", nullable = false)
  private LocalDateTime computedAt;

  protected FireRiskRegion() {}

  public FireRiskRegion(
      String regionCode,
      String regionName,
      int fireCount5y,
      int responseTimeP90Seconds,
      int casualtyTotal,
      BigDecimal nightFireRatio,
      BigDecimal highRiskStructureRatio,
      BigDecimal negligenceFireRatio,
      BigDecimal riskScore,
      String riskGrade) {
    this.regionCode = regionCode;
    this.regionName = regionName;
    this.fireCount5y = fireCount5y;
    this.responseTimeP90Seconds = responseTimeP90Seconds;
    this.casualtyTotal = casualtyTotal;
    this.nightFireRatio = nightFireRatio;
    this.highRiskStructureRatio = highRiskStructureRatio;
    this.negligenceFireRatio = negligenceFireRatio;
    this.riskScore = riskScore;
    this.riskGrade = riskGrade;
    this.computedAt = LocalDateTime.now();
  }

  public String getRegionCode() {
    return regionCode;
  }

  public String getRegionName() {
    return regionName;
  }

  public BigDecimal getRiskScore() {
    return riskScore;
  }

  public String getRiskGrade() {
    return riskGrade;
  }

  public LocalDateTime getComputedAt() {
    return computedAt;
  }
}

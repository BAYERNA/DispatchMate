package com.faind.domain.incident.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

// DB설계서 §3.11 ai_judgment_logs. incident 패키지가 쓰기(사전분석·CCTV감지·드론정찰 로그 생성)를
// 소유하고, statistics 패키지는 같은 테이블을 읽기 전용 read model로 재사용한다(§1 원칙 5 "재사용 우선").
@Entity
@Table(name = "ai_judgment_logs")
public class AiJudgmentLog {

  @Id
  @GeneratedValue
  @UuidGenerator
  @Column(name = "judgment_id")
  private UUID judgmentId;

  @Column(name = "judgment_type", nullable = false, length = 30)
  private String judgmentType; // PRE_ANALYSIS/REPORT_SOP_MATCH/RISK_DETECTION/CCTV_DETECTION/DRONE_RECON

  @Column(name = "related_incident_id")
  private UUID relatedIncidentId;

  @Column(name = "related_report_id")
  private UUID relatedReportId;

  @Column(name = "source_device_id")
  private UUID sourceDeviceId;

  @Column(name = "confidence_score", precision = 5, scale = 2)
  private BigDecimal confidenceScore;

  // FR-24 CCTV 자동 화재감지 전용(Phase 6 ADM-009 통계용) — YoloService가 산출한 0~100 위험도
  // 점수. CCTV_DETECTION이 아닌 다른 judgmentType은 이 값을 채우지 않는다(정보 없음=NULL).
  @Column(name = "danger_score", precision = 5, scale = 2)
  private BigDecimal dangerScore;

  // "AUTO"(ai-server CCTV 폴링) | "MANUAL"(ADM-010 관제실 수동 등록). 클라이언트가 보낸 값이
  // 아니라 어느 API 경로로 들어왔는지로 서버가 결정한다 — 통계가 자기신고에 의존하지 않도록.
  @Column(name = "detection_source", length = 10)
  private String detectionSource;

  // ADM-001 "AI 의심감지 대기열" 증거 스냅샷(감지 박스가 그려진 JPEG, base64) — 관제실이 신뢰도
  // 숫자만 보고 확인/오탐을 결정하지 않아도 되게 한다. CCTV_DETECTION 전용, 없으면 NULL.
  @Column(name = "snapshot_base64", columnDefinition = "TEXT")
  private String snapshotBase64;

  @Column
  private String summary;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  protected AiJudgmentLog() {}

  public AiJudgmentLog(
      String judgmentType, UUID relatedIncidentId, UUID relatedReportId, UUID sourceDeviceId,
      BigDecimal confidenceScore, String summary) {
    this(judgmentType, relatedIncidentId, relatedReportId, sourceDeviceId, confidenceScore, null, null, null, summary);
  }

  public AiJudgmentLog(
      String judgmentType, UUID relatedIncidentId, UUID relatedReportId, UUID sourceDeviceId,
      BigDecimal confidenceScore, BigDecimal dangerScore, String detectionSource, String snapshotBase64,
      String summary) {
    this.judgmentType = judgmentType;
    this.relatedIncidentId = relatedIncidentId;
    this.relatedReportId = relatedReportId;
    this.sourceDeviceId = sourceDeviceId;
    this.confidenceScore = confidenceScore;
    this.dangerScore = dangerScore;
    this.detectionSource = detectionSource;
    this.snapshotBase64 = snapshotBase64;
    this.summary = summary;
    this.createdAt = LocalDateTime.now();
  }

  public void linkToIncident(UUID incidentId) {
    this.relatedIncidentId = incidentId;
  }

  public UUID getJudgmentId() {
    return judgmentId;
  }

  public String getJudgmentType() {
    return judgmentType;
  }

  public UUID getRelatedIncidentId() {
    return relatedIncidentId;
  }

  public UUID getRelatedReportId() {
    return relatedReportId;
  }

  public UUID getSourceDeviceId() {
    return sourceDeviceId;
  }

  public BigDecimal getConfidenceScore() {
    return confidenceScore;
  }

  public BigDecimal getDangerScore() {
    return dangerScore;
  }

  public String getDetectionSource() {
    return detectionSource;
  }

  public String getSnapshotBase64() {
    return snapshotBase64;
  }

  public String getSummary() {
    return summary;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }
}

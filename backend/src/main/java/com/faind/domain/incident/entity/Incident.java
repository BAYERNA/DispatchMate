package com.faind.domain.incident.entity;

import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
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

// DB설계서 §3.3 incidents. v2.2: status는 기본값이 없다(fail-closed) — 이 엔티티의 생성자는
// 그래서 항상 status를 명시적으로 요구하도록 만들어져 있다(정적 팩토리 메서드만 노출).
@Entity
@Table(name = "incidents")
public class Incident {

  @Id
  @GeneratedValue
  @UuidGenerator
  @Column(name = "incident_id")
  private UUID incidentId;

  @Column(name = "incident_number", nullable = false, unique = true, length = 30)
  private String incidentNumber;

  @Enumerated(EnumType.STRING)
  @Column(name = "incident_type", nullable = false, length = 20)
  private IncidentType incidentType;

  @Column
  private String address;

  @Column(precision = 9, scale = 6)
  private BigDecimal latitude;

  @Column(precision = 9, scale = 6)
  private BigDecimal longitude;

  @Column(name = "reported_at", nullable = false)
  private LocalDateTime reportedAt;

  @Column(name = "closed_at")
  private LocalDateTime closedAt;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 15)
  private IncidentStatus status;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 20)
  private IncidentSource source;

  @Column(name = "confirmed_by")
  private UUID confirmedBy;

  @Column(name = "commander_id")
  private UUID commanderId;

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  protected Incident() {}

  private Incident(
      String incidentNumber,
      IncidentType incidentType,
      String address,
      BigDecimal latitude,
      BigDecimal longitude,
      LocalDateTime reportedAt,
      IncidentStatus status,
      IncidentSource source,
      UUID commanderId) {
    this.incidentNumber = incidentNumber;
    this.incidentType = incidentType;
    this.address = address;
    this.latitude = latitude;
    this.longitude = longitude;
    this.reportedAt = reportedAt;
    this.status = status;
    this.source = source;
    this.commanderId = commanderId;
    this.createdAt = LocalDateTime.now();
  }

  // FR-01 이후 흐름: 사람이 119에 직접 신고 — 관제 확인 절차 없이 곧바로 정식 출동.
  public static Incident manualReport(
      String incidentNumber,
      IncidentType incidentType,
      String address,
      BigDecimal latitude,
      BigDecimal longitude,
      LocalDateTime reportedAt,
      UUID commanderId) {
    return new Incident(
        incidentNumber, incidentType, address, latitude, longitude, reportedAt, IncidentStatus.DISPATCHED,
        IncidentSource.MANUAL_REPORT, commanderId);
  }

  // FR-24: CCTV가 화재를 의심 감지 — NFR-08에 따라 절대 이 시점에서 DISPATCHED가 될 수 없다.
  public static Incident cctvSuspected(
      String incidentNumber, String address, BigDecimal latitude, BigDecimal longitude, LocalDateTime reportedAt) {
    return new Incident(
        incidentNumber, IncidentType.FIRE, address, latitude, longitude, reportedAt, IncidentStatus.AI_SUSPECTED,
        IncidentSource.CCTV_AUTO_DETECTION, null);
  }

  // NFR-08: 이 전환의 호출자가 실제로 role=ADMIN인지는 IncidentConfirmService가 API 레벨에서
  // 검증한다. 엔티티는 상태 전이 규칙(AI_SUSPECTED에서만 가능)만 지킨다.
  public void confirmDispatch(UUID confirmedByUserId) {
    if (status != IncidentStatus.AI_SUSPECTED) {
      throw new BusinessException(ErrorCode.INVALID_INCIDENT_STATE, "AI_SUSPECTED 상태에서만 확정할 수 있습니다.");
    }
    this.status = IncidentStatus.DISPATCHED;
    this.confirmedBy = confirmedByUserId;
  }

  // "오탐 처리" — 실제 출동 없이 종료하고 학습 데이터로만 흔적을 남긴다.
  // confirmedBy를 반드시 채워야 한다 — chk_incidents_confirmed_by_gate가 AI_SUSPECTED를 벗어나는
  // CCTV_AUTO_DETECTION 출동엔 confirmed_by를 요구한다(사람이 실제로 판단했다는 증거).
  public void rejectAsFalsePositive(UUID rejectedByUserId) {
    if (status != IncidentStatus.AI_SUSPECTED) {
      throw new BusinessException(ErrorCode.INVALID_INCIDENT_STATE, "AI_SUSPECTED 상태에서만 오탐 처리할 수 있습니다.");
    }
    this.status = IncidentStatus.CLOSED;
    this.closedAt = LocalDateTime.now();
    this.confirmedBy = rejectedByUserId;
  }

  public void markInProgress() {
    if (status != IncidentStatus.DISPATCHED) {
      throw new BusinessException(ErrorCode.INVALID_INCIDENT_STATE, "DISPATCHED 상태에서만 진행중으로 전환할 수 있습니다.");
    }
    this.status = IncidentStatus.IN_PROGRESS;
  }

  // FR-05: 상황 종료 확정. QA 최우선 재검증 대상 — IncidentService.close()가 이 호출과
  // IncidentClosedEvent 발행을 같은 트랜잭션 메서드 안에서 함께 수행해야 한다.
  public void close() {
    if (status == IncidentStatus.CLOSED) {
      throw new BusinessException(ErrorCode.INVALID_INCIDENT_STATE, "이미 종료된 출동입니다.");
    }
    if (status == IncidentStatus.AI_SUSPECTED) {
      throw new BusinessException(ErrorCode.INVALID_INCIDENT_STATE, "AI 의심감지 상태는 확정·오탐 처리를 먼저 거쳐야 합니다.");
    }
    this.status = IncidentStatus.CLOSED;
    this.closedAt = LocalDateTime.now();
  }

  public void assignCommander(UUID commanderId) {
    this.commanderId = commanderId;
  }

  public UUID getIncidentId() {
    return incidentId;
  }

  public String getIncidentNumber() {
    return incidentNumber;
  }

  public IncidentType getIncidentType() {
    return incidentType;
  }

  public String getAddress() {
    return address;
  }

  public BigDecimal getLatitude() {
    return latitude;
  }

  public BigDecimal getLongitude() {
    return longitude;
  }

  public LocalDateTime getReportedAt() {
    return reportedAt;
  }

  public LocalDateTime getClosedAt() {
    return closedAt;
  }

  public IncidentStatus getStatus() {
    return status;
  }

  public IncidentSource getSource() {
    return source;
  }

  public UUID getConfirmedBy() {
    return confirmedBy;
  }

  public UUID getCommanderId() {
    return commanderId;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }
}

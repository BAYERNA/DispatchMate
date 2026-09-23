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

  // 멀티테넌시 1단계(V17): 이 출동이 속한 조직. CCTV 자동감지 경로는 로그인 사용자가 없으므로
  // 감지한 카메라(device)의 organizationId를 그대로 상속한다.
  @Column(name = "organization_id", nullable = false)
  private UUID organizationId;

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

  // FR-25: 자동배정이 게이트(기상/비행금지구역)나 가용 드론 부족으로 건너뛰어진 사유. 지휘관이
  // "왜 드론이 안 떴는지" CMD-001/002에서 볼 수 있도록 한다 — 실제 DroneDispatch row가 생기지
  // 않는 경우라 다른 곳엔 남길 데가 없다.
  @Column(name = "drone_dispatch_skip_reason", length = 30)
  private String droneDispatchSkipReason;

  @Column(name = "drone_dispatch_skipped_at")
  private LocalDateTime droneDispatchSkippedAt;

  protected Incident() {}

  private Incident(
      UUID organizationId,
      String incidentNumber,
      IncidentType incidentType,
      String address,
      BigDecimal latitude,
      BigDecimal longitude,
      LocalDateTime reportedAt,
      IncidentStatus status,
      IncidentSource source,
      UUID commanderId) {
    this.organizationId = organizationId;
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
      UUID organizationId,
      String incidentNumber,
      IncidentType incidentType,
      String address,
      BigDecimal latitude,
      BigDecimal longitude,
      LocalDateTime reportedAt,
      UUID commanderId) {
    return new Incident(
        organizationId, incidentNumber, incidentType, address, latitude, longitude, reportedAt,
        IncidentStatus.DISPATCHED, IncidentSource.MANUAL_REPORT, commanderId);
  }

  // FR-24: CCTV가 화재를 의심 감지 — NFR-08에 따라 절대 이 시점에서 DISPATCHED가 될 수 없다.
  // organizationId는 감지한 카메라(device)의 소속 조직을 그대로 물려받는다(로그인 사용자 없음).
  public static Incident cctvSuspected(
      UUID organizationId,
      String incidentNumber,
      String address,
      BigDecimal latitude,
      BigDecimal longitude,
      LocalDateTime reportedAt) {
    return new Incident(
        organizationId, incidentNumber, IncidentType.FIRE, address, latitude, longitude, reportedAt,
        IncidentStatus.AI_SUSPECTED, IncidentSource.CCTV_AUTO_DETECTION, null);
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

  public void recordDroneDispatchSkipped(String reason) {
    this.droneDispatchSkipReason = reason;
    this.droneDispatchSkippedAt = LocalDateTime.now();
  }

  // 이전 시도(예: CCTV 의심감지 단계에서 기상 게이트에 막힘)가 남긴 사유는, 이후 실제로 드론이
  // 배정되면 더 이상 유효하지 않으므로 지운다 — 화면에 낡은 사유가 계속 남지 않게.
  public void clearDroneDispatchSkip() {
    this.droneDispatchSkipReason = null;
    this.droneDispatchSkippedAt = null;
  }

  public UUID getIncidentId() {
    return incidentId;
  }

  public UUID getOrganizationId() {
    return organizationId;
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

  public String getDroneDispatchSkipReason() {
    return droneDispatchSkipReason;
  }

  public LocalDateTime getDroneDispatchSkippedAt() {
    return droneDispatchSkippedAt;
  }
}

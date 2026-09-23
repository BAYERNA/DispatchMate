package com.faind.domain.incident.dto;

import com.faind.domain.incident.entity.Incident;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record IncidentResponse(
    UUID incidentId,
    String incidentNumber,
    String incidentType,
    String address,
    BigDecimal latitude,
    BigDecimal longitude,
    LocalDateTime reportedAt,
    LocalDateTime closedAt,
    String status,
    String source,
    UUID confirmedBy,
    UUID commanderId,
    String droneDispatchSkipReason,
    LocalDateTime droneDispatchSkippedAt) {

  public static IncidentResponse from(Incident incident) {
    return new IncidentResponse(
        incident.getIncidentId(),
        incident.getIncidentNumber(),
        incident.getIncidentType().name(),
        incident.getAddress(),
        incident.getLatitude(),
        incident.getLongitude(),
        incident.getReportedAt(),
        incident.getClosedAt(),
        incident.getStatus().name(),
        incident.getSource().name(),
        incident.getConfirmedBy(),
        incident.getCommanderId(),
        incident.getDroneDispatchSkipReason(),
        incident.getDroneDispatchSkippedAt());
  }
}

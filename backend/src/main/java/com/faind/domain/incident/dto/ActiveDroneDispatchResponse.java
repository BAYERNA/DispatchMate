package com.faind.domain.incident.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

// Firefly GCS 라이트 지도 뷰: 지금 떠 있는(EN_ROUTE/ON_SITE) 드론의 위치와, 그 드론이 향하는
// 사건의 목표 좌표를 함께 담는다. 드론 좌표는 설치 위치가 아니라 Device.relocate()로 갱신되는
// "현재" 좌표이므로 라이브 텔레메트리는 아니지만, 실제 DB에 있는 값이다.
public record ActiveDroneDispatchResponse(
    UUID dispatchId,
    UUID incidentId,
    String incidentNumber,
    String incidentAddress,
    BigDecimal targetLatitude,
    BigDecimal targetLongitude,
    String dispatchStatus,
    LocalDateTime dispatchedAt,
    UUID droneId,
    String droneSerialNo,
    BigDecimal droneLatitude,
    BigDecimal droneLongitude,
    Integer droneBatteryLevel) {}

package com.faind.domain.incident.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

// ADM-001 "AI 의심감지 대기열" 표의 한 행 (FR-24, NFR-08).
public record AiSuspectedQueueItemResponse(
    UUID incidentId,
    UUID judgmentId,
    UUID sourceDeviceId,
    String address,
    LocalDateTime detectedAt,
    BigDecimal confidenceScore,
    String status,
    // 감지 박스가 그려진 증거 스냅샷(JPEG, base64) — 구버전 로그·수동감지 등은 null일 수 있다.
    String snapshotBase64) {}

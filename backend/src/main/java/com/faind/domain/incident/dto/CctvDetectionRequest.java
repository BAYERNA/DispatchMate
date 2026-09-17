package com.faind.domain.incident.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

// ai-server의 fire_detection_router가 CCTV 스트림에서 화재를 의심 감지했을 때 콜백으로 보내는 페이로드.
// (코드구조설계서 §3 fire_detection_router.py "감지결과 수신 + Java 모놀리식으로 콜백")
// ADM-010(Phase 5/6) 관제실 수동 등록도 같은 DTO를 재사용한다.
public record CctvDetectionRequest(
    @NotNull UUID cameraDeviceId,
    String addressHint,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal confidenceScore,
    // Phase 6 ADM-009 통계용. YoloService danger_score(0~100) 원본값 — 판단 보류(값을 못 구한 경우)면 null.
    @DecimalMin("0") @DecimalMax("100") BigDecimal dangerScore,
    String summary,
    LocalDateTime detectedAt,
    // ADM-001 "AI 의심감지 대기열" 증거 스냅샷(감지 박스가 그려진 JPEG, base64) — 없으면 null.
    String snapshotBase64) {}

package com.faind.domain.firerisk.dto;

import java.math.BigDecimal;

// 관리자가 제출하는 지역별 원시 화재 통계 6개 지표 — Fire Risk Score 계산의 입력.
// (소방청 화재이력 빅데이터를 자동 수집하는 파이프라인은 아직 없어, 수동 제출을 입력으로 받는다.)
public record FireRiskRegionInput(
    String regionCode,
    String regionName,
    int fireCount5y,
    int responseTimeP90Seconds,
    int casualtyTotal,
    BigDecimal nightFireRatio,
    BigDecimal highRiskStructureRatio,
    BigDecimal negligenceFireRatio) {}

package com.faind.domain.firerisk.dto;

import java.math.BigDecimal;

public record FireRiskRegionResponse(
    String regionCode, String regionName, BigDecimal riskScore, String riskGrade, int rank) {}

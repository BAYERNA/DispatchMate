package com.faind.integration.publicdata;

// 기상청 초단기실황 조회 결과에서 드론 비행 안전 판단에 필요한 두 값만 뽑은 것.
public record WeatherSnapshot(double windSpeedMs, double precipitationMm) {}

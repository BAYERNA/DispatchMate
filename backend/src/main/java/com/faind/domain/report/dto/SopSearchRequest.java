package com.faind.domain.report.dto;

import jakarta.validation.constraints.NotBlank;

// ai-server SopMatchAgent가 제출된 사후보고서 원문을 그대로 보낸다.
public record SopSearchRequest(@NotBlank String content) {}

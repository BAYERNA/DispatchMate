package com.faind.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

// 조직 온보딩: 새 조직(공설소방서/자체소방대) 등록 요청. code는 로그인 화면의 "기관선택"에 대응하는
// 짧은 식별자다(예: SEOUL-FIRE, SAMSUNG-ULSAN).
public record OrganizationCreateRequest(
    @NotBlank @Pattern(regexp = "[A-Z0-9_-]{2,30}", message = "조직 코드는 영문 대문자·숫자·-·_ 2~30자여야 합니다.")
        String code,
    @NotBlank String name,
    @Pattern(regexp = "PUBLIC|CORPORATE", message = "조직 유형은 PUBLIC/CORPORATE 중 하나여야 합니다.") String type) {}

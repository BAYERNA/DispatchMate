package com.faind.domain.organization.dto;

import jakarta.validation.constraints.NotBlank;

// 조직 온보딩: 새로 만든 조직의 첫 ADMIN 계정 발급 요청. role은 여기서 입력받지 않는다 —
// 이 엔드포인트 자체가 "그 조직의 첫 관리자를 만든다"는 뜻이라 role은 서버가 항상 ADMIN으로 고정한다.
public record OrganizationAdminAccountRequest(
    @NotBlank String name, @NotBlank String badgeNumber, String team, String phone) {}

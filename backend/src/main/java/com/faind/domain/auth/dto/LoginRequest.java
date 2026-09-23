package com.faind.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;

// 멀티테넌시 1단계(V17): badge_number가 조직 안에서만 유일해졌으므로 로그인 시점에 조직을
// 특정해야 한다 — organizationCode는 조직의 공개 코드(예: "DEFAULT")이며 화면의 기관선택에 대응한다.
public record LoginRequest(
    @NotBlank String organizationCode, @NotBlank String badgeNumber, @NotBlank String password) {}

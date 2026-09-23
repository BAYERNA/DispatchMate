package com.faind.domain.auth.dto;

import java.util.UUID;

// CMN-001 annot#1: 역할은 계정에 종속되어 로그인 후 자동 라우팅된다.
// CMN-002 annot#1: isInitialPassword=true면 프론트가 강제로 최초 비밀번호 설정 화면으로 이동시킨다.
public record LoginResponse(
    String accessToken,
    UUID userId,
    UUID organizationId,
    String name,
    String role,
    boolean initialPassword) {}

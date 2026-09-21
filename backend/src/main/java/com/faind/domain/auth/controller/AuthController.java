package com.faind.domain.auth.controller;

import com.faind.domain.auth.dto.LoginRequest;
import com.faind.domain.auth.dto.LoginResponse;
import com.faind.domain.auth.dto.SetInitialPasswordRequest;
import com.faind.domain.auth.service.AuthService;
import com.faind.global.security.CurrentUser;
import com.faind.global.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// CMN-001 통합 로그인 / CMN-002 최초 비밀번호 설정 (FR-01)
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  // Other services revalidate against current account state, not only the JWT signature.
  @org.springframework.web.bind.annotation.GetMapping("/session")
  public AuthenticatedUser session(@CurrentUser AuthenticatedUser currentUser) {
    return currentUser;
  }

  @PostMapping("/login")
  public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
    return ResponseEntity.ok(authService.login(request));
  }

  @PatchMapping("/password/initial")
  public ResponseEntity<Void> setInitialPassword(
      @CurrentUser AuthenticatedUser currentUser, @Valid @RequestBody SetInitialPasswordRequest request) {
    authService.setInitialPassword(currentUser.userId(), request);
    return ResponseEntity.ok().build();
  }
}

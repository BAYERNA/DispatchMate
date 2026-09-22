package com.faind.domain.auth.controller;

import com.faind.domain.auth.dto.AccountCreatedResponse;
import com.faind.domain.auth.dto.AccountRequest;
import com.faind.domain.auth.dto.AccountResponse;
import com.faind.domain.auth.service.AccountService;
import com.faind.global.security.AuthenticatedUser;
import com.faind.global.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// ADM-002 대원 계정 목록 / ADM-003 계정 등록·수정 (FR-10). 관리자 전용.
@RestController
@RequestMapping("/api/v1/accounts")
@PreAuthorize("hasRole('ADMIN')")
public class AccountController {

  private final AccountService accountService;

  public AccountController(AccountService accountService) {
    this.accountService = accountService;
  }

  // CMD-002 대원 배정: 지휘관도 배정 가능한 대원을 검색해야 하므로 목록 조회는 COMMANDER에게도 연다
  // (등록·수정·비활성화는 여전히 ADMIN 전용).
  @GetMapping
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<Page<AccountResponse>> list(
      @CurrentUser AuthenticatedUser currentUser,
      @RequestParam(required = false) String keyword,
      @RequestParam(required = false, defaultValue = "ALL") String role,
      Pageable pageable) {
    return ResponseEntity.ok(accountService.list(currentUser.organizationId(), keyword, role, pageable));
  }

  // CMD-002/003: 지휘관도 현장 대원 식별을 위해 개별 계정 조회는 허용한다 (목록·등록·수정은 ADMIN 전용 유지).
  @GetMapping("/{userId}")
  @PreAuthorize("hasAnyRole('COMMANDER','ADMIN')")
  public ResponseEntity<AccountResponse> get(@CurrentUser AuthenticatedUser currentUser, @PathVariable UUID userId) {
    return ResponseEntity.ok(accountService.getAccount(currentUser.organizationId(), userId));
  }

  @PostMapping
  public ResponseEntity<AccountCreatedResponse> register(
      @CurrentUser AuthenticatedUser currentUser, @Valid @RequestBody AccountRequest request) {
    return ResponseEntity.ok(accountService.register(currentUser.organizationId(), request));
  }

  @PutMapping("/{userId}")
  public ResponseEntity<AccountResponse> update(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID userId, @Valid @RequestBody AccountRequest request) {
    return ResponseEntity.ok(accountService.update(currentUser.organizationId(), userId, request));
  }

  @PatchMapping("/{userId}/password/reissue")
  public ResponseEntity<AccountCreatedResponse> reissuePassword(
      @CurrentUser AuthenticatedUser currentUser, @PathVariable UUID userId) {
    return ResponseEntity.ok(accountService.reissueTemporaryPassword(currentUser.organizationId(), userId));
  }

  @DeleteMapping("/{userId}")
  public ResponseEntity<Void> deactivate(@CurrentUser AuthenticatedUser currentUser, @PathVariable UUID userId) {
    accountService.deactivate(currentUser.organizationId(), userId);
    return ResponseEntity.noContent().build();
  }
}

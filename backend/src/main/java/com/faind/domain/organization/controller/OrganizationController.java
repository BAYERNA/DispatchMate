package com.faind.domain.organization.controller;

import com.faind.domain.auth.dto.AccountCreatedResponse;
import com.faind.domain.organization.dto.OrganizationAdminAccountRequest;
import com.faind.domain.organization.dto.OrganizationCreateRequest;
import com.faind.domain.organization.dto.OrganizationResponse;
import com.faind.domain.organization.service.OrganizationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 조직 온보딩: 새 조직 등록 + 첫 ADMIN 계정 발급. SUPER_ADMIN 전용 — 일반 ADMIN은 자기 조직
// 밖의 그 무엇도 만들 권한이 없어야 하므로 클래스 레벨에서 role을 강제한다(다른 도메인
// 컨트롤러들이 hasRole('ADMIN')을 강제하는 것과 같은 원칙, NFR-08 계열).
@RestController
@RequestMapping("/api/v1/organizations")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class OrganizationController {

  private final OrganizationService organizationService;

  public OrganizationController(OrganizationService organizationService) {
    this.organizationService = organizationService;
  }

  @GetMapping
  public ResponseEntity<List<OrganizationResponse>> list() {
    return ResponseEntity.ok(organizationService.list());
  }

  @PostMapping
  public ResponseEntity<OrganizationResponse> create(@Valid @RequestBody OrganizationCreateRequest request) {
    return ResponseEntity.ok(organizationService.create(request));
  }

  @PostMapping("/{organizationId}/admin-accounts")
  public ResponseEntity<AccountCreatedResponse> issueFirstAdmin(
      @PathVariable UUID organizationId, @Valid @RequestBody OrganizationAdminAccountRequest request) {
    return ResponseEntity.ok(organizationService.issueFirstAdmin(organizationId, request));
  }
}

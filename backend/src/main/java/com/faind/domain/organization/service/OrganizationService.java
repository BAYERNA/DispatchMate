package com.faind.domain.organization.service;

import com.faind.domain.auth.dto.AccountCreatedResponse;
import com.faind.domain.auth.dto.AccountRequest;
import com.faind.domain.auth.service.AccountService;
import com.faind.domain.organization.dto.OrganizationAdminAccountRequest;
import com.faind.domain.organization.dto.OrganizationCreateRequest;
import com.faind.domain.organization.dto.OrganizationResponse;
import com.faind.domain.organization.entity.Organization;
import com.faind.domain.organization.repository.OrganizationRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 조직 온보딩: 슈퍼관리자가 새 조직을 만들고 그 조직의 첫 ADMIN 계정을 발급하는 흐름
// (OrganizationController가 hasRole('SUPER_ADMIN')으로 API 레벨에서 강제한다).
@Service
@Transactional(readOnly = true)
public class OrganizationService {

  private final OrganizationRepository organizationRepository;
  private final AccountService accountService;

  public OrganizationService(OrganizationRepository organizationRepository, AccountService accountService) {
    this.organizationRepository = organizationRepository;
    this.accountService = accountService;
  }

  public List<OrganizationResponse> list() {
    return organizationRepository.findAll().stream().map(OrganizationResponse::from).toList();
  }

  @Transactional
  public OrganizationResponse create(OrganizationCreateRequest request) {
    if (organizationRepository.findByCode(request.code()).isPresent()) {
      throw new BusinessException(ErrorCode.DUPLICATE_ORGANIZATION_CODE);
    }
    Organization organization = new Organization(request.code(), request.name(), request.type());
    organizationRepository.save(organization);
    return OrganizationResponse.from(organization);
  }

  // AccountService.register()가 organizationId를 그대로 인자로 받으므로(로그인한 관리자 자신의
  // 조직으로 암묵 스코프하지 않는다), 슈퍼관리자가 지정한 임의 조직에 계정을 발급하는 이 경로에
  // 그대로 재사용할 수 있다 — role만 여기서 ADMIN으로 고정한다.
  @Transactional
  public AccountCreatedResponse issueFirstAdmin(UUID organizationId, OrganizationAdminAccountRequest request) {
    organizationRepository.findById(organizationId)
        .orElseThrow(() -> new BusinessException(ErrorCode.ORGANIZATION_NOT_FOUND));
    return accountService.register(
        organizationId, new AccountRequest(request.name(), "ADMIN", request.badgeNumber(), request.team(), request.phone()));
  }
}

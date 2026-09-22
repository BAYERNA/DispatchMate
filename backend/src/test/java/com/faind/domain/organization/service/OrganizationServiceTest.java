package com.faind.domain.organization.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.faind.domain.auth.dto.AccountCreatedResponse;
import com.faind.domain.auth.dto.AccountRequest;
import com.faind.domain.auth.dto.AccountResponse;
import com.faind.domain.auth.service.AccountService;
import com.faind.domain.organization.dto.OrganizationAdminAccountRequest;
import com.faind.domain.organization.dto.OrganizationCreateRequest;
import com.faind.domain.organization.entity.Organization;
import com.faind.domain.organization.repository.OrganizationRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

// 조직 온보딩(6번): 슈퍼관리자가 새 조직을 만들고 첫 ADMIN 계정을 발급하는 서비스 로직 검증.
@ExtendWith(MockitoExtension.class)
class OrganizationServiceTest {

  @Mock private OrganizationRepository organizationRepository;
  @Mock private AccountService accountService;

  private OrganizationService organizationService;

  @BeforeEach
  void setUp() {
    organizationService = new OrganizationService(organizationRepository, accountService);
  }

  @Test
  void 이미_사용_중인_조직_코드는_등록할_수_없다() {
    when(organizationRepository.findByCode("SEOUL-FIRE")).thenReturn(Optional.of(new Organization("SEOUL-FIRE", "서울소방본부", "PUBLIC")));

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class,
        () -> organizationService.create(new OrganizationCreateRequest("SEOUL-FIRE", "서울소방본부(중복)", "PUBLIC")));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.DUPLICATE_ORGANIZATION_CODE);
  }

  @Test
  void 새로운_조직_코드는_정상_등록된다() {
    when(organizationRepository.findByCode("SAMSUNG-ULSAN")).thenReturn(Optional.empty());

    var response = organizationService.create(new OrganizationCreateRequest("SAMSUNG-ULSAN", "삼성 울산 자체소방대", "CORPORATE"));

    assertThat(response.code()).isEqualTo("SAMSUNG-ULSAN");
    assertThat(response.type()).isEqualTo("CORPORATE");
  }

  @Test
  void 존재하지_않는_조직에는_첫_ADMIN_계정을_발급할_수_없다() {
    UUID organizationId = UUID.randomUUID();
    when(organizationRepository.findById(organizationId)).thenReturn(Optional.empty());

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class,
        () -> organizationService.issueFirstAdmin(
            organizationId, new OrganizationAdminAccountRequest("홍길동", "A0001", "관리팀", "010-0000-0000")));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.ORGANIZATION_NOT_FOUND);
  }

  @Test
  void 첫_ADMIN_계정_발급은_role을_ADMIN으로_강제한다() {
    UUID organizationId = UUID.randomUUID();
    when(organizationRepository.findById(organizationId))
        .thenReturn(Optional.of(new Organization("SAMSUNG-ULSAN", "삼성 울산 자체소방대", "CORPORATE")));
    AccountCreatedResponse expected = new AccountCreatedResponse(
        new AccountResponse(UUID.randomUUID(), "홍길동", "ADMIN", "A0001", "관리팀", "010-0000-0000", "ACTIVE", null),
        "temp-password");
    when(accountService.register(org.mockito.ArgumentMatchers.eq(organizationId), any())).thenReturn(expected);

    var result = organizationService.issueFirstAdmin(
        organizationId, new OrganizationAdminAccountRequest("홍길동", "A0001", "관리팀", "010-0000-0000"));

    assertThat(result).isEqualTo(expected);
    ArgumentCaptor<AccountRequest> captor = ArgumentCaptor.forClass(AccountRequest.class);
    verify(accountService).register(org.mockito.ArgumentMatchers.eq(organizationId), captor.capture());
    assertThat(captor.getValue().role()).isEqualTo("ADMIN");
    assertThat(captor.getValue().badgeNumber()).isEqualTo("A0001");
  }

  @Test
  void 조직_목록은_저장소_결과를_그대로_반환한다() {
    when(organizationRepository.findAll())
        .thenReturn(List.of(new Organization("SEOUL-FIRE", "서울소방본부", "PUBLIC")));

    var result = organizationService.list();

    assertThat(result).hasSize(1);
    assertThat(result.get(0).code()).isEqualTo("SEOUL-FIRE");
  }
}

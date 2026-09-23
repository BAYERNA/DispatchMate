package com.faind.domain.auth.service;

import com.faind.domain.auth.dto.AccountCreatedResponse;
import com.faind.domain.auth.dto.AccountRequest;
import com.faind.domain.auth.dto.AccountResponse;
import com.faind.domain.auth.entity.User;
import com.faind.domain.auth.repository.UserRepository;
import com.faind.domain.auth.repository.UserSpecifications;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-10 대원 계정 관리 (ADM-002 목록, ADM-003 등록·수정).
// QA 재검증 대상이었던 두 결함을 이 서비스에서 직접 해소한다:
//  1) 수정 진입 시 폼이 비어있던 문제 -> getAccount()가 항상 전체 필드를 채워 반환
//  2) 검색·필터 미작동 -> list()가 UserSpecifications로 실제 쿼리에 바인딩
@Service
@Transactional(readOnly = true)
public class AccountService {

  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final TemporaryPasswordGenerator temporaryPasswordGenerator;

  public AccountService(
      UserRepository userRepository, PasswordEncoder passwordEncoder, TemporaryPasswordGenerator temporaryPasswordGenerator) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.temporaryPasswordGenerator = temporaryPasswordGenerator;
  }

  public Page<AccountResponse> list(
      UUID organizationId, String keyword, String role, boolean includeInactive, Pageable pageable) {
    return userRepository.findAll(UserSpecifications.search(organizationId, keyword, role, includeInactive), pageable)
        .map(AccountResponse::from);
  }

  public AccountResponse getAccount(UUID organizationId, UUID userId) {
    return AccountResponse.from(findUser(organizationId, userId));
  }

  // device 패키지가 "매핑대원 검색"(NFR-05)을 위해 이름/사번/소속으로 매칭되는 user_id만 조회할 때 사용.
  // Device 엔티티나 리포지토리를 직접 참조하지 않고, 이 서비스 인터페이스를 거치도록 해 도메인 경계를 지킨다.
  public List<UUID> findUserIdsByKeyword(UUID organizationId, String keyword) {
    if (keyword == null || keyword.isBlank()) {
      return List.of();
    }
    return userRepository.findAll(UserSpecifications.search(organizationId, keyword, "ALL", false)).stream()
        .map(User::getUserId)
        .toList();
  }

  @Transactional
  public AccountCreatedResponse register(UUID organizationId, AccountRequest request) {
    if (request.badgeNumber() == null || request.badgeNumber().isBlank()) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "사번은 필수입니다.");
    }
    if (userRepository.existsByOrganizationIdAndBadgeNumber(organizationId, request.badgeNumber())) {
      throw new BusinessException(ErrorCode.DUPLICATE_BADGE_NUMBER);
    }
    String temporaryPassword = temporaryPasswordGenerator.generate();
    User user = new User(
        organizationId,
        request.name(),
        request.role(),
        request.badgeNumber(),
        request.team(),
        request.phone(),
        passwordEncoder.encode(temporaryPassword));
    userRepository.save(user);
    return new AccountCreatedResponse(AccountResponse.from(user), temporaryPassword);
  }

  @Transactional
  public AccountResponse update(UUID organizationId, UUID userId, AccountRequest request) {
    User user = findUser(organizationId, userId);
    user.update(request.name(), request.team(), request.phone(), request.role());
    return AccountResponse.from(user);
  }

  @Transactional
  public AccountCreatedResponse reissueTemporaryPassword(UUID organizationId, UUID userId) {
    User user = findUser(organizationId, userId);
    String temporaryPassword = temporaryPasswordGenerator.generate();
    user.resetPassword(passwordEncoder.encode(temporaryPassword));
    return new AccountCreatedResponse(AccountResponse.from(user), temporaryPassword);
  }

  @Transactional
  public void deactivate(UUID organizationId, UUID userId) {
    findUser(organizationId, userId).deactivate();
  }

  // 전체 프로세스 점검 중 발견: 비활성화는 있는데 되돌릴 방법이 없어, 잘못 비활성화하면 그 사번을
  // 영영 못 쓰게 되는 결함이었다(사번 유일 제약은 상태와 무관하게 걸려 있음).
  @Transactional
  public void reactivate(UUID organizationId, UUID userId) {
    findUser(organizationId, userId).activate();
  }

  // device 패키지가 매핑대원 이름·소속팀을 응답 DTO에 채울 때 사용 (Device 엔티티 직접 접근 없이 호출).
  public Map<UUID, AccountResponse> findAccountsByIds(List<UUID> userIds) {
    if (userIds == null || userIds.isEmpty()) {
      return Map.of();
    }
    return userRepository.findAllById(userIds).stream()
        .collect(java.util.stream.Collectors.toMap(User::getUserId, AccountResponse::from, (a, b) -> a));
  }

  // ADM-001 관리자 홈(FR-09) "근무 대원" 카드. 근무편성(ADM-005)은 Won't Have라 별도 duty-shift
  // 개념이 없으므로, 이번 스코프에서는 "활성 대원 계정 수"를 근사치로 사용한다.
  public long countActiveResponders(UUID organizationId) {
    return userRepository.countByOrganizationIdAndRoleAndStatus(organizationId, "RESPONDER", "ACTIVE");
  }

  // organizationId까지 일치해야 조회되도록 해 다른 조직의 user_id를 추측해 조회·수정·비활성화
  // 하는 경로를 막는다(멀티테넌시 1단계 격리).
  private User findUser(UUID organizationId, UUID userId) {
    User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    if (!user.getOrganizationId().equals(organizationId)) {
      throw new BusinessException(ErrorCode.USER_NOT_FOUND);
    }
    return user;
  }
}

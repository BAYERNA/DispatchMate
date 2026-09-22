package com.faind.domain.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.faind.domain.auth.dto.LoginRequest;
import com.faind.domain.auth.entity.User;
import com.faind.domain.auth.repository.UserRepository;
import com.faind.domain.organization.entity.Organization;
import com.faind.domain.organization.repository.OrganizationRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.global.security.JwtTokenProvider;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

// 보안 점검(Phase 10)에서 추가한 로그인 시도 제한(사번당 15분에 5회)의 회귀 방지 테스트.
@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

  private static final UUID ORG_ID = UUID.randomUUID();

  @Mock private UserRepository userRepository;
  @Mock private OrganizationRepository organizationRepository;
  @Mock private PasswordEncoder passwordEncoder;
  @Mock private JwtTokenProvider jwtTokenProvider;
  @Mock private StringRedisTemplate redisTemplate;
  @Mock private ValueOperations<String, String> valueOperations;

  private AuthService authService;

  @BeforeEach
  void setUp() {
    when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    authService = new AuthService(userRepository, organizationRepository, passwordEncoder, jwtTokenProvider, redisTemplate);
  }

  // organizationId는 @GeneratedValue라 실제 저장 전엔 null이다 — mock 리포지토리가 반환하는
  // 엔티티는 저장을 거치지 않으므로, 테스트에서만 리플렉션으로 채워 넣는다.
  private Organization organization() {
    Organization organization = new Organization("DEFAULT", "기본 조직", "PUBLIC");
    ReflectionTestUtils.setField(organization, "organizationId", ORG_ID);
    return organization;
  }

  private User activeUser() {
    return new User(ORG_ID, "홍길동", "RESPONDER", "B0001", "1팀", "010-0000-0000", "encoded-hash");
  }

  @Test
  void 비밀번호가_틀리면_실패_횟수를_기록하고_INVALID_CREDENTIALS를_던진다() {
    when(valueOperations.get("login:attempts:DEFAULT:B0001")).thenReturn(null);
    when(organizationRepository.findByCode("DEFAULT")).thenReturn(Optional.of(organization()));
    when(userRepository.findByOrganizationIdAndBadgeNumber(ORG_ID, "B0001")).thenReturn(Optional.of(activeUser()));
    when(passwordEncoder.matches("wrong", "encoded-hash")).thenReturn(false);

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class, () -> authService.login(new LoginRequest("DEFAULT", "B0001", "wrong")));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    verify(valueOperations).increment("login:attempts:DEFAULT:B0001");
  }

  @Test
  void 존재하지_않는_사번도_실패_횟수를_기록한다() {
    when(valueOperations.get("login:attempts:DEFAULT:UNKNOWN")).thenReturn(null);
    when(organizationRepository.findByCode("DEFAULT")).thenReturn(Optional.of(organization()));
    when(userRepository.findByOrganizationIdAndBadgeNumber(ORG_ID, "UNKNOWN")).thenReturn(Optional.empty());

    org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class, () -> authService.login(new LoginRequest("DEFAULT", "UNKNOWN", "any")));

    verify(valueOperations).increment("login:attempts:DEFAULT:UNKNOWN");
  }

  @Test
  void 존재하지_않는_조직_코드도_INVALID_CREDENTIALS를_던진다() {
    when(valueOperations.get("login:attempts:UNKNOWN_ORG:B0001")).thenReturn(null);
    when(organizationRepository.findByCode("UNKNOWN_ORG")).thenReturn(Optional.empty());

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class, () -> authService.login(new LoginRequest("UNKNOWN_ORG", "B0001", "any")));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.INVALID_CREDENTIALS);
  }

  @Test
  void 윈도우_내_5회_실패하면_비밀번호가_맞아도_TOO_MANY_LOGIN_ATTEMPTS를_던진다() {
    when(valueOperations.get("login:attempts:DEFAULT:B0001")).thenReturn("5");

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class, () -> authService.login(new LoginRequest("DEFAULT", "B0001", "whatever")));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.TOO_MANY_LOGIN_ATTEMPTS);
  }

  @Test
  void 로그인에_성공하면_실패_카운터를_지운다() {
    when(valueOperations.get("login:attempts:DEFAULT:B0001")).thenReturn("2");
    when(organizationRepository.findByCode("DEFAULT")).thenReturn(Optional.of(organization()));
    when(userRepository.findByOrganizationIdAndBadgeNumber(ORG_ID, "B0001")).thenReturn(Optional.of(activeUser()));
    when(passwordEncoder.matches("correct", "encoded-hash")).thenReturn(true);
    when(jwtTokenProvider.createToken(null, "B0001", "RESPONDER", 0)).thenReturn("issued-token");

    var response = authService.login(new LoginRequest("DEFAULT", "B0001", "correct"));

    assertThat(response.accessToken()).isEqualTo("issued-token");
    verify(redisTemplate).delete("login:attempts:DEFAULT:B0001");
  }
}

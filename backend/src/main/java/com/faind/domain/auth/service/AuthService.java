package com.faind.domain.auth.service;

import com.faind.domain.auth.dto.LoginRequest;
import com.faind.domain.auth.dto.LoginResponse;
import com.faind.domain.auth.dto.SetInitialPasswordRequest;
import com.faind.domain.auth.entity.User;
import com.faind.domain.auth.repository.UserRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.global.security.JwtTokenProvider;
import java.time.Duration;
import java.util.UUID;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// FR-01 통합 로그인 + CMN-002 최초 비밀번호 설정.
@Service
@Transactional(readOnly = true)
public class AuthService {

  // 보안 점검(Phase 10)에서 발견: 로그인 시도 횟수 제한이 전혀 없어 사번을 고정하고 비밀번호를
  // 무한히 대입하는 크리덴셜 스터핑이 가능했다. FR-20 라우팅 캐시와 동일하게 이미 있는 Redis를
  // 그대로 써서(새 의존성 추가 없이) 사번당 실패 횟수를 센다.
  private static final String LOGIN_ATTEMPT_KEY_PREFIX = "login:attempts:";
  private static final int MAX_LOGIN_ATTEMPTS = 5;
  private static final Duration LOGIN_ATTEMPT_WINDOW = Duration.ofMinutes(15);

  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final JwtTokenProvider jwtTokenProvider;
  private final StringRedisTemplate redisTemplate;

  public AuthService(
      UserRepository userRepository,
      PasswordEncoder passwordEncoder,
      JwtTokenProvider jwtTokenProvider,
      StringRedisTemplate redisTemplate) {
    this.userRepository = userRepository;
    this.passwordEncoder = passwordEncoder;
    this.jwtTokenProvider = jwtTokenProvider;
    this.redisTemplate = redisTemplate;
  }

  public LoginResponse login(LoginRequest request) {
    String attemptKey = LOGIN_ATTEMPT_KEY_PREFIX + request.badgeNumber();
    String attemptsRaw = redisTemplate.opsForValue().get(attemptKey);
    int attempts = attemptsRaw == null ? 0 : Integer.parseInt(attemptsRaw);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      throw new BusinessException(ErrorCode.TOO_MANY_LOGIN_ATTEMPTS);
    }

    User user = userRepository.findByBadgeNumber(request.badgeNumber()).orElse(null);
    if (user == null || !"ACTIVE".equals(user.getStatus()) || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
      recordFailedAttempt(attemptKey);
      throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
    }

    redisTemplate.delete(attemptKey);
    String accessToken = jwtTokenProvider.createToken(user.getUserId(), user.getBadgeNumber(), user.getRole(), user.getTokenVersion());
    return new LoginResponse(accessToken, user.getUserId(), user.getName(), user.getRole(), user.isInitialPassword());
  }

  private void recordFailedAttempt(String key) {
    Long count = redisTemplate.opsForValue().increment(key);
    if (count != null && count == 1) {
      redisTemplate.expire(key, LOGIN_ATTEMPT_WINDOW);
    }
  }

  @Transactional
  public void setInitialPassword(UUID userId, SetInitialPasswordRequest request) {
    if (!request.isConfirmed()) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "새 비밀번호와 확인 값이 일치하지 않습니다.");
    }
    User user = userRepository.findById(userId).orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    user.completeInitialPasswordSetup(passwordEncoder.encode(request.newPassword()));
  }
}

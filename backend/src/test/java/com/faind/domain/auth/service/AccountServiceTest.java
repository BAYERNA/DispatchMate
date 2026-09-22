package com.faind.domain.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.faind.domain.auth.dto.AccountRequest;
import com.faind.domain.auth.entity.User;
import com.faind.domain.auth.repository.UserRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

// 멀티테넌시 1단계(V17) 회귀 방지: 다른 조직의 user_id를 알거나 추측해도 조회·수정·비밀번호
// 재발급·비활성화가 되지 않아야 한다는 것을 검증한다.
@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

  private static final UUID ORG_A = UUID.randomUUID();
  private static final UUID ORG_B = UUID.randomUUID();

  @Mock private UserRepository userRepository;
  @Mock private PasswordEncoder passwordEncoder;
  @Mock private TemporaryPasswordGenerator temporaryPasswordGenerator;

  private AccountService accountService;

  @BeforeEach
  void setUp() {
    accountService = new AccountService(userRepository, passwordEncoder, temporaryPasswordGenerator);
  }

  private User userInOrgB(UUID userId) {
    User user = new User(ORG_B, "홍길동", "RESPONDER", "B0001", "1팀", "010-0000-0000", "hash");
    org.springframework.test.util.ReflectionTestUtils.setField(user, "userId", userId);
    return user;
  }

  @Test
  void 다른_조직의_계정은_조회할_수_없다() {
    UUID userId = UUID.randomUUID();
    when(userRepository.findById(userId)).thenReturn(Optional.of(userInOrgB(userId)));

    var thrown = org.junit.jupiter.api.Assertions.assertThrows(
        BusinessException.class, () -> accountService.getAccount(ORG_A, userId));

    assertThat(thrown.getErrorCode()).isEqualTo(ErrorCode.USER_NOT_FOUND);
  }

  @Test
  void 다른_조직의_계정은_수정할_수_없다() {
    UUID userId = UUID.randomUUID();
    when(userRepository.findById(userId)).thenReturn(Optional.of(userInOrgB(userId)));

    assertThatThrownBy(() -> accountService.update(ORG_A, userId, new AccountRequest("이름", "RESPONDER", null, "1팀", "010-0000-0000")))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 다른_조직의_계정은_비밀번호를_재발급할_수_없다() {
    UUID userId = UUID.randomUUID();
    when(userRepository.findById(userId)).thenReturn(Optional.of(userInOrgB(userId)));

    assertThatThrownBy(() -> accountService.reissueTemporaryPassword(ORG_A, userId))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 다른_조직의_계정은_비활성화할_수_없다() {
    UUID userId = UUID.randomUUID();
    when(userRepository.findById(userId)).thenReturn(Optional.of(userInOrgB(userId)));

    assertThatThrownBy(() -> accountService.deactivate(ORG_A, userId))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 같은_조직의_계정은_정상_조회된다() {
    UUID userId = UUID.randomUUID();
    User user = new User(ORG_A, "홍길동", "RESPONDER", "B0001", "1팀", "010-0000-0000", "hash");
    org.springframework.test.util.ReflectionTestUtils.setField(user, "userId", userId);
    when(userRepository.findById(userId)).thenReturn(Optional.of(user));

    var response = accountService.getAccount(ORG_A, userId);

    assertThat(response.userId()).isEqualTo(userId);
  }
}

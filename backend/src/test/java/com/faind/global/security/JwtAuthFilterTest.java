package com.faind.global.security;

import com.faind.domain.auth.entity.User;
import com.faind.domain.auth.repository.UserRepository;
import io.jsonwebtoken.Jwts;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtAuthFilterTest {
  @AfterEach void clear() { SecurityContextHolder.clearContext(); }

  private boolean authenticated(String status, String currentRole, long version) throws Exception {
    UUID id = UUID.randomUUID();
    JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    UserRepository users = mock(UserRepository.class);
    User user = mock(User.class);
    when(user.getStatus()).thenReturn(status);
    when(user.getRole()).thenReturn(currentRole);
    when(user.getTokenVersion()).thenReturn(version);
    when(users.findById(id)).thenReturn(Optional.of(user));
    when(tokens.parseClaims("token")).thenReturn(Jwts.claims().subject(id.toString()).add("role", "RESPONDER").add("tokenVersion", 0L).build());
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader("Authorization", "Bearer token");
    new JwtAuthFilter(tokens, users).doFilter(request, new MockHttpServletResponse(), (req, res) -> {});
    return SecurityContextHolder.getContext().getAuthentication() != null;
  }

  @Test void allowsActiveCurrentToken() throws Exception { assertTrue(authenticated("ACTIVE", "RESPONDER", 0)); }
  @Test void rejectsDeactivatedAccount() throws Exception { assertFalse(authenticated("INACTIVE", "RESPONDER", 0)); }
  @Test void rejectsChangedRole() throws Exception { assertFalse(authenticated("ACTIVE", "COMMANDER", 0)); }
  @Test void rejectsOldPasswordSession() throws Exception { assertFalse(authenticated("ACTIVE", "RESPONDER", 1)); }
}

package com.faind.global.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

  private static final String AUTH_HEADER = "Authorization";
  private static final String BEARER_PREFIX = "Bearer ";

  private final JwtTokenProvider jwtTokenProvider;
  private final com.faind.domain.auth.repository.UserRepository users;

  public JwtAuthFilter(JwtTokenProvider jwtTokenProvider, com.faind.domain.auth.repository.UserRepository users) {
    this.jwtTokenProvider = jwtTokenProvider;
    this.users = users;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String token = resolveToken(request);
    if (StringUtils.hasText(token)) {
      try {
        Claims claims = jwtTokenProvider.parseClaims(token);
        String userId = claims.getSubject();
        String role = claims.get("role", String.class);
        var user = users.findById(java.util.UUID.fromString(userId)).orElse(null);
        Number version = claims.get("tokenVersion", Number.class);
        if (user == null || !"ACTIVE".equals(user.getStatus()) || !user.getRole().equals(role)
            || user.getTokenVersion() != (version == null ? 0 : version.longValue())) {
          throw new JwtException("폐기된 세션입니다.");
        }
        // organizationId는 JWT claim이 아니라 매 요청마다 DB에서 다시 읽는다 — role/tokenVersion을
        // 이미 여기서 재검증하는 것과 같은 이유(폐기된 세션·변경된 소속을 즉시 반영).
        var authenticatedUser = new AuthenticatedUser(user.getUserId(), role, user.getOrganizationId());
        var authentication = new UsernamePasswordAuthenticationToken(
            authenticatedUser, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
        SecurityContextHolder.getContext().setAuthentication(authentication);
      } catch (JwtException | IllegalArgumentException ignored) {
        SecurityContextHolder.clearContext();
      }
    }
    filterChain.doFilter(request, response);
  }

  private String resolveToken(HttpServletRequest request) {
    String bearer = request.getHeader(AUTH_HEADER);
    if (StringUtils.hasText(bearer) && bearer.startsWith(BEARER_PREFIX)) {
      return bearer.substring(BEARER_PREFIX.length());
    }
    return null;
  }
}

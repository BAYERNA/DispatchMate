package com.faind.global.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

// ai-server → backend 콜백(FR-24 CCTV 감지, FR-26 드론 정찰 결과) + Prometheus의 /actuator/prometheus
// 스크레이핑 전용 — 로그인 사용자 JWT가 아니라 내부 서비스끼리만 공유하는 토큰으로 검증한다.
// notification-server의 InternalWebhookGuard와 동일한 설계:
// faind.security.internal-service-token을 설정하지 않으면(로컬 데모 기본값) 검증을 건너뛴다.
@Component
public class InternalServiceAuthFilter extends OncePerRequestFilter {

  private static final String BEARER_PREFIX = "Bearer ";
  private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();
  private static final String[] INTERNAL_PATHS = {
    "/api/v1/incidents/dispatch/cctv-detections",
    "/api/v1/incidents/drone-dispatches/*/recon-result",
    "/actuator/prometheus"
  };

  private final String internalServiceToken;

  public InternalServiceAuthFilter(
      @Value("${faind.security.internal-service-token:}") String internalServiceToken) {
    this.internalServiceToken = internalServiceToken;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    if (!isInternalServicePath(request) || !StringUtils.hasText(internalServiceToken)) {
      filterChain.doFilter(request, response);
      return;
    }
    String header = request.getHeader("Authorization");
    String token = header != null && header.startsWith(BEARER_PREFIX) ? header.substring(BEARER_PREFIX.length()) : null;
    if (!internalServiceToken.equals(token)) {
      response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
      response.setContentType("application/json;charset=UTF-8");
      response.getWriter().write("{\"message\":\"내부 서비스 토큰이 유효하지 않습니다.\"}");
      return;
    }
    filterChain.doFilter(request, response);
  }

  private boolean isInternalServicePath(HttpServletRequest request) {
    String uri = request.getRequestURI();
    for (String pattern : INTERNAL_PATHS) {
      if (PATH_MATCHER.match(pattern, uri)) {
        return true;
      }
    }
    return false;
  }
}

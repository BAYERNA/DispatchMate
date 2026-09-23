package com.faind.global.security;

import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

// FR-01 이후 컨트롤러 전반에서 "지금 로그인한 사용자"를 꺼내 쓰기 위한 공용 리졸버.
// NFR-08(confirmed_by는 API 레벨에서 role=ADMIN 검증)처럼 인증 정보를 화면이 아니라
// API 자체에서 강제해야 하는 지점에서 이 값을 그대로 사용한다.
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return parameter.hasParameterAnnotation(CurrentUser.class);
  }

  @Override
  public Object resolveArgument(
      MethodParameter parameter,
      ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest,
      WebDataBinderFactory binderFactory) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !authentication.isAuthenticated()) {
      return null;
    }
    return authentication.getPrincipal() instanceof AuthenticatedUser authenticatedUser ? authenticatedUser : null;
  }
}

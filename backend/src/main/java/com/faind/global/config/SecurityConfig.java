package com.faind.global.config;

import com.faind.global.security.InternalServiceAuthFilter;
import com.faind.global.security.JwtAuthFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

  private static final String[] PUBLIC_ENDPOINTS = {
    "/api/v1/auth/login",
    "/actuator/health",
    "/swagger-ui/**",
    "/v3/api-docs/**"
  };

  // ai-server 콜백 + Prometheus 스크레이핑 전용 — 로그인 사용자 JWT 대신
  // InternalServiceAuthFilter가 별도 토큰으로 검증한다(토큰 미설정 시 로컬 데모 기본값으로 검증 생략).
  private static final String[] INTERNAL_SERVICE_ENDPOINTS = {
    "/api/v1/incidents/dispatch/cctv-detections",
    "/api/v1/incidents/drone-dispatches/*/recon-result",
    "/actuator/prometheus"
  };

  private final JwtAuthFilter jwtAuthFilter;
  private final InternalServiceAuthFilter internalServiceAuthFilter;
  private final boolean prometheusPublic;

  public SecurityConfig(
      JwtAuthFilter jwtAuthFilter,
      InternalServiceAuthFilter internalServiceAuthFilter,
      @Value("${faind.monitoring.prometheus-public:false}") boolean prometheusPublic) {
    this.jwtAuthFilter = jwtAuthFilter;
    this.internalServiceAuthFilter = internalServiceAuthFilter;
    this.prometheusPublic = prometheusPublic;
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .cors(Customizer.withDefaults())
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            auth -> {
              auth.requestMatchers(PUBLIC_ENDPOINTS).permitAll()
                  .requestMatchers(INTERNAL_SERVICE_ENDPOINTS).permitAll();
              if (prometheusPublic) {
                auth.requestMatchers("/actuator/prometheus").permitAll();
              }
              auth.anyRequest().authenticated();
            })
        .addFilterBefore(internalServiceAuthFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
    return config.getAuthenticationManager();
  }
}

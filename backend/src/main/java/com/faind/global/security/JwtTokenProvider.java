package com.faind.global.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenProvider {

  private final Key key;
  private final long expirationMillis;

  public JwtTokenProvider(
      @Value("${faind.jwt.secret}") String secret,
      @Value("${faind.jwt.expiration-minutes:480}") long expirationMinutes) {
    this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    this.expirationMillis = expirationMinutes * 60 * 1000;
  }

  public String createToken(UUID userId, String badgeNumber, String role) {
    return createToken(userId, badgeNumber, role, 0);
  }

  public String createToken(UUID userId, String badgeNumber, String role, long tokenVersion) {
    Date now = new Date();
    Date expiry = new Date(now.getTime() + expirationMillis);
    return Jwts.builder()
        .subject(userId.toString())
        .claim("badgeNumber", badgeNumber)
        .claim("role", role)
        .claim("tokenVersion", tokenVersion)
        .issuedAt(now)
        .expiration(expiry)
        .signWith(key)
        .compact();
  }

  public Claims parseClaims(String token) {
    try {
      return Jwts.parser().verifyWith((javax.crypto.SecretKey) key).build()
          .parseSignedClaims(token).getPayload();
    } catch (ExpiredJwtException e) {
      throw e;
    } catch (JwtException | IllegalArgumentException e) {
      throw new JwtException("유효하지 않은 토큰입니다.", e);
    }
  }

  public boolean isValid(String token) {
    try {
      parseClaims(token);
      return true;
    } catch (JwtException | IllegalArgumentException e) {
      return false;
    }
  }
}

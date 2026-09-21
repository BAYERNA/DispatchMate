package com.faind.domain.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

// DB설계서 §3.1 users
@Entity
@Table(name = "users")
public class User {

  @Id
  @GeneratedValue
  @UuidGenerator
  @Column(name = "user_id")
  private UUID userId;

  @Column(nullable = false, length = 50)
  private String name;

  @Column(nullable = false, length = 20)
  private String role; // ADMIN / COMMANDER / RESPONDER

  @Column(name = "badge_number", nullable = false, unique = true, length = 20)
  private String badgeNumber;

  @Column(length = 50)
  private String team;

  @Column(length = 20)
  private String phone;

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Column(name = "is_initial_password", nullable = false)
  private boolean initialPassword = true;

  @Column(nullable = false, length = 10)
  private String status = "ACTIVE"; // ACTIVE / INACTIVE

  @Column(name = "token_version", nullable = false)
  private long tokenVersion;

  public long getTokenVersion() { return tokenVersion; }

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  protected User() {}

  public User(String name, String role, String badgeNumber, String team, String phone, String passwordHash) {
    this.name = name;
    this.role = role;
    this.badgeNumber = badgeNumber;
    this.team = team;
    this.phone = phone;
    this.passwordHash = passwordHash;
    this.initialPassword = true;
    this.status = "ACTIVE";
    this.createdAt = LocalDateTime.now();
  }

  // FR-10: 계정 수정 — QA에서 "수정 시 기존 정보가 프리필되지 않음"이 확인된 지점이라
  // 조회한 엔티티를 그대로 갱신하는 방식으로, 누락 없이 전체 필드를 다시 채운다.
  public void update(String name, String team, String phone, String role) {
    if (!java.util.Objects.equals(this.role, role)) tokenVersion++;
    this.name = name;
    this.team = team;
    this.phone = phone;
    this.role = role;
    this.updatedAt = LocalDateTime.now();
  }

  public void resetPassword(String newPasswordHash) {
    tokenVersion++;
    this.passwordHash = newPasswordHash;
    this.initialPassword = true;
    this.updatedAt = LocalDateTime.now();
  }

  public void completeInitialPasswordSetup(String newPasswordHash) {
    this.passwordHash = newPasswordHash;
    this.initialPassword = false;
    this.updatedAt = LocalDateTime.now();
  }

  public void deactivate() {
    tokenVersion++;
    this.status = "INACTIVE";
    this.updatedAt = LocalDateTime.now();
  }

  public boolean isAdmin() {
    return "ADMIN".equals(role);
  }

  public UUID getUserId() {
    return userId;
  }

  public String getName() {
    return name;
  }

  public String getRole() {
    return role;
  }

  public String getBadgeNumber() {
    return badgeNumber;
  }

  public String getTeam() {
    return team;
  }

  public String getPhone() {
    return phone;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public boolean isInitialPassword() {
    return initialPassword;
  }

  public String getStatus() {
    return status;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }

  public LocalDateTime getUpdatedAt() {
    return updatedAt;
  }
}

package com.faind.domain.organization.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

// 멀티테넌시 1단계(V17): 공설소방서(PUBLIC)와 대기업 자체소방대(CORPORATE, 위험물안전관리법상
// 의무 설치 대상 시설)가 하나의 시스템을 독립적으로 공유해 쓸 수 있도록 하는 최상위 격리 단위.
@Entity
@Table(name = "organizations")
public class Organization {

  @Id
  @GeneratedValue
  @UuidGenerator
  @Column(name = "organization_id")
  private UUID organizationId;

  @Column(nullable = false, unique = true, length = 30)
  private String code;

  @Column(nullable = false, length = 100)
  private String name;

  @Column(nullable = false, length = 15)
  private String type; // PUBLIC / CORPORATE

  @Column(nullable = false, length = 10)
  private String status = "ACTIVE"; // ACTIVE / INACTIVE

  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;

  protected Organization() {}

  public Organization(String code, String name, String type) {
    this.code = code;
    this.name = name;
    this.type = type;
    this.status = "ACTIVE";
    this.createdAt = LocalDateTime.now();
  }

  public UUID getOrganizationId() {
    return organizationId;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public String getType() {
    return type;
  }

  public String getStatus() {
    return status;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }
}

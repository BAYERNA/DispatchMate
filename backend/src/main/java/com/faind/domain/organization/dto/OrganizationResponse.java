package com.faind.domain.organization.dto;

import com.faind.domain.organization.entity.Organization;
import java.time.LocalDateTime;
import java.util.UUID;

public record OrganizationResponse(
    UUID organizationId, String code, String name, String type, String status, LocalDateTime createdAt) {

  public static OrganizationResponse from(Organization organization) {
    return new OrganizationResponse(
        organization.getOrganizationId(),
        organization.getCode(),
        organization.getName(),
        organization.getType(),
        organization.getStatus(),
        organization.getCreatedAt());
  }
}

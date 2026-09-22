package com.faind.domain.organization.repository;

import com.faind.domain.organization.entity.Organization;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

  Optional<Organization> findByCode(String code);
}

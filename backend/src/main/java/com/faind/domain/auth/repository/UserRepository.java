package com.faind.domain.auth.repository;

import com.faind.domain.auth.entity.User;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface UserRepository extends JpaRepository<User, UUID>, JpaSpecificationExecutor<User> {

  // 멀티테넌시 1단계(V17): badge_number는 이제 조직 안에서만 유일하다 — 조직 무관 조회는
  // 다른 조직의 동일 배지번호 계정을 잘못 찾아올 수 있어 항상 organizationId와 함께 조회한다.
  Optional<User> findByOrganizationIdAndBadgeNumber(UUID organizationId, String badgeNumber);

  boolean existsByOrganizationIdAndBadgeNumber(UUID organizationId, String badgeNumber);

  long countByOrganizationIdAndRoleAndStatus(UUID organizationId, String role, String status);
}

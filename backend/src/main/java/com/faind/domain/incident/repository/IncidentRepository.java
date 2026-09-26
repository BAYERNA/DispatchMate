package com.faind.domain.incident.repository;

import com.faind.domain.incident.entity.Incident;
import com.faind.domain.incident.entity.IncidentStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IncidentRepository extends JpaRepository<Incident, UUID> {

  Optional<Incident> findByIncidentNumber(String incidentNumber);

  // AI_SUSPECTED 대기열(ADM-001)은 CctvDetectionService 내부 조회라 아직 조직 스코프를 걸지 않는다 —
  // Phase 2에서 관제실 화면과 함께 정리한다.
  List<Incident> findByStatusOrderByReportedAtDesc(IncidentStatus status);

  List<Incident> findByOrganizationIdAndStatusInOrderByReportedAtDesc(UUID organizationId, List<IncidentStatus> statuses);

  Page<Incident> findAllByOrganizationIdOrderByReportedAtDesc(UUID organizationId, Pageable pageable);

  long countByOrganizationIdAndStatus(UUID organizationId, IncidentStatus status);

  long countByOrganizationIdAndReportedAtAfter(UUID organizationId, java.time.LocalDateTime after);
}

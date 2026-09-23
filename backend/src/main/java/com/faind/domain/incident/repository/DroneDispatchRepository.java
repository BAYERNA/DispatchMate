package com.faind.domain.incident.repository;

import com.faind.domain.incident.entity.DroneDispatch;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DroneDispatchRepository extends JpaRepository<DroneDispatch, UUID> {

  List<DroneDispatch> findByIncidentIdOrderByDispatchedAtDesc(UUID incidentId);

  // Firefly GCS 라이트 지도 뷰: 아직 복귀(RETURNED)하지 않은, 지금 실제로 떠 있는 드론들.
  List<DroneDispatch> findByStatusInOrderByDispatchedAtDesc(List<String> statuses);
}

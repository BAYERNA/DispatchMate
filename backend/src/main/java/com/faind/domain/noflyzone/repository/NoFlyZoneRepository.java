package com.faind.domain.noflyzone.repository;

import com.faind.domain.noflyzone.entity.NoFlyZone;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoFlyZoneRepository extends JpaRepository<NoFlyZone, UUID> {

  List<NoFlyZone> findByActiveTrue();
}

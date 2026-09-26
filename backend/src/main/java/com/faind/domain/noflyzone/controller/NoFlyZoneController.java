package com.faind.domain.noflyzone.controller;

import com.faind.domain.noflyzone.dto.NoFlyZoneRequest;
import com.faind.domain.noflyzone.dto.NoFlyZoneResponse;
import com.faind.domain.noflyzone.service.NoFlyZoneService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 비행 전 규제 체크 — organizations와 무관한 전역 참조 데이터라 조회는 조직 관리자(ADMIN) 누구나
// 가능하지만, 구역 등록은 플랫폼 관리자(SUPER_ADMIN)만 한다(FireRiskController와 동일한 이유).
@RestController
@RequestMapping("/api/v1/no-fly-zones")
public class NoFlyZoneController {

  private final NoFlyZoneService noFlyZoneService;

  public NoFlyZoneController(NoFlyZoneService noFlyZoneService) {
    this.noFlyZoneService = noFlyZoneService;
  }

  @GetMapping
  @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
  public ResponseEntity<List<NoFlyZoneResponse>> list() {
    return ResponseEntity.ok(noFlyZoneService.list());
  }

  @PostMapping
  @PreAuthorize("hasRole('SUPER_ADMIN')")
  public ResponseEntity<NoFlyZoneResponse> register(@RequestBody NoFlyZoneRequest request) {
    return ResponseEntity.ok(noFlyZoneService.register(request));
  }
}

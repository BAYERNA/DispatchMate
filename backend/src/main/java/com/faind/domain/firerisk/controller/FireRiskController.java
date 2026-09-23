package com.faind.domain.firerisk.controller;

import com.faind.domain.firerisk.dto.FireRiskRegionInput;
import com.faind.domain.firerisk.dto.FireRiskRegionResponse;
import com.faind.domain.firerisk.service.FireRiskScoreService;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Fire Risk Score — 지역 단위 화재 위험도. organizations와 무관한 전역 참조 데이터라 조회는
// 조직 관리자(ADMIN) 누구나 가능하지만, 값을 갱신하는 건 플랫폼 관리자(SUPER_ADMIN)만 한다 —
// 일반 조직 관리자가 다른 조직도 참고하는 공유 데이터를 바꿀 수는 없다.
@RestController
@RequestMapping("/api/v1/fire-risk")
public class FireRiskController {

  private final FireRiskScoreService fireRiskScoreService;

  public FireRiskController(FireRiskScoreService fireRiskScoreService) {
    this.fireRiskScoreService = fireRiskScoreService;
  }

  @GetMapping("/regions")
  @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
  public ResponseEntity<List<FireRiskRegionResponse>> ranked() {
    return ResponseEntity.ok(fireRiskScoreService.getRanked());
  }

  @PostMapping("/regions/recompute")
  @PreAuthorize("hasRole('SUPER_ADMIN')")
  public ResponseEntity<List<FireRiskRegionResponse>> recompute(@RequestBody List<FireRiskRegionInput> inputs) {
    return ResponseEntity.ok(fireRiskScoreService.recompute(inputs));
  }
}

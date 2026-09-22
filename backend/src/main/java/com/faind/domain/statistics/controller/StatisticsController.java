package com.faind.domain.statistics.controller;

import com.faind.domain.statistics.dto.StatisticsSummaryResponse;
import com.faind.domain.statistics.service.StatisticsService;
import com.faind.global.security.AuthenticatedUser;
import com.faind.global.security.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// ADM-009 기관 통계 대시보드 (FR-13, FR-27)
@RestController
@RequestMapping("/api/v1/statistics")
@PreAuthorize("hasRole('ADMIN')")
public class StatisticsController {

  private final StatisticsService statisticsService;

  public StatisticsController(StatisticsService statisticsService) {
    this.statisticsService = statisticsService;
  }

  @GetMapping("/summary")
  public ResponseEntity<StatisticsSummaryResponse> summary(@CurrentUser AuthenticatedUser currentUser) {
    return ResponseEntity.ok(statisticsService.getSummary(currentUser.organizationId()));
  }
}

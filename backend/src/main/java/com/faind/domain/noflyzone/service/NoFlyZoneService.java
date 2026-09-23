package com.faind.domain.noflyzone.service;

import com.faind.domain.noflyzone.dto.NoFlyZoneRequest;
import com.faind.domain.noflyzone.dto.NoFlyZoneResponse;
import com.faind.domain.noflyzone.entity.NoFlyZone;
import com.faind.domain.noflyzone.repository.NoFlyZoneRepository;
import com.faind.global.error.BusinessException;
import com.faind.global.error.ErrorCode;
import com.faind.global.util.GeoUtil;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// 비행 전 규제 체크(FAIND 사업계획서 "관제권/비행금지구역 사전 확인"): 실제 국토교통부 비행금지구역
// API 연동 전까지는 no_fly_zones에 담긴 원형(중심좌표+반경) 구역으로 판단한다. 실존 관제권 좌표가
// 아니라 데모/예시 구역이라는 점은 마이그레이션 시드 데이터 주석에 명시했다.
@Service
@Transactional(readOnly = true)
public class NoFlyZoneService {

  private final NoFlyZoneRepository repository;

  public NoFlyZoneService(NoFlyZoneRepository repository) {
    this.repository = repository;
  }

  public List<NoFlyZoneResponse> list() {
    return repository.findAll().stream().map(NoFlyZoneResponse::from).toList();
  }

  @Transactional
  public NoFlyZoneResponse register(NoFlyZoneRequest request) {
    // 코드 리뷰 finding: 구역명·유형이 비어 있으면 이 검증을 통과해 zone_name/zone_type의
    // NOT NULL 제약을 그대로 때려서 원시 DataIntegrityViolationException(500)으로 샜다.
    if (request.zoneName() == null || request.zoneName().isBlank()) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "구역명이 필요합니다.");
    }
    if (request.zoneType() == null || request.zoneType().isBlank()) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "구역 유형이 필요합니다.");
    }
    if (request.centerLatitude() == null || request.centerLongitude() == null) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "구역 중심 좌표가 필요합니다.");
    }
    if (request.radiusKm() == null || request.radiusKm().signum() <= 0) {
      throw new BusinessException(ErrorCode.INVALID_INPUT, "반경(km)은 0보다 커야 합니다.");
    }
    NoFlyZone zone = new NoFlyZone(
        request.zoneName(), request.zoneType(), request.centerLatitude(), request.centerLongitude(),
        request.radiusKm());
    return NoFlyZoneResponse.from(repository.save(zone));
  }

  // FR-25 드론 자동배정 게이트: 목표 좌표가 활성 구역 중 하나라도 반경 안에 들면 비행금지로 본다.
  // 좌표 자체가 없으면(구소 좌표 미입력 등) 판단 근거가 없으므로 막지 않는다 — 이미 weather-safety
  // 게이트와 같은 fail-open 전제(핵심 배차 로직 가용성을 부가 안전장치가 해치면 안 됨).
  public boolean isRestricted(BigDecimal latitude, BigDecimal longitude) {
    if (latitude == null || longitude == null) {
      return false;
    }
    return repository.findByActiveTrue().stream()
        .anyMatch(zone -> GeoUtil.haversineKm(
                latitude.doubleValue(), longitude.doubleValue(),
                zone.getCenterLatitude().doubleValue(), zone.getCenterLongitude().doubleValue())
            <= zone.getRadiusKm().doubleValue());
  }
}

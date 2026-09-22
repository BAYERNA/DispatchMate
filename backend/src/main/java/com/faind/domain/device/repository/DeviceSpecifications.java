package com.faind.domain.device.repository;

import com.faind.domain.device.entity.Device;
import com.faind.domain.device.entity.DeviceType;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

// NFR-05: 기기 목록 검색·필터 — ADM-006에서 "필터 선택해도 목록 그대로"였던 QA 결함의 재발 방지 대상.
public final class DeviceSpecifications {

  private DeviceSpecifications() {}

  // "기기ID·매핑대원 검색" — 매핑대원 이름은 device 패키지가 직접 조회하지 않고(도메인 경계 원칙),
  // AccountService를 통해 미리 조회한 매칭 user_id 목록(matchedUserIds)을 받아 OR 조건으로 합친다.
  // organizationId는 UserSpecifications.search()와 동일한 이유로 필수 인자다(멀티테넌시 1단계, V17).
  public static Specification<Device> search(
      UUID organizationId, String keyword, DeviceType deviceType, List<UUID> matchedUserIds) {
    return (root, query, cb) -> {
      var predicates = cb.equal(root.get("organizationId"), organizationId);
      if (StringUtils.hasText(keyword)) {
        String pattern = "%" + keyword.trim().toLowerCase() + "%";
        var keywordPredicate = cb.like(cb.lower(root.get("serialNo")), pattern);
        if (matchedUserIds != null && !matchedUserIds.isEmpty()) {
          keywordPredicate = cb.or(keywordPredicate, root.get("currentUserId").in(matchedUserIds));
        }
        predicates = cb.and(predicates, keywordPredicate);
      }
      if (deviceType != null) {
        predicates = cb.and(predicates, cb.equal(root.get("deviceType"), deviceType));
      }
      return predicates;
    };
  }
}

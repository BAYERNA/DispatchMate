package com.faind.domain.auth.repository;

import com.faind.domain.auth.entity.User;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

// NFR-05: 대원 계정 목록의 검색·필터는 MVP 필수 — QA에서 반복 미작동했던 지점이라
// 쿼리 파라미터가 실제로 WHERE 절까지 바인딩되는지가 이 클래스의 존재 이유다.
public final class UserSpecifications {

  private UserSpecifications() {}

  // organizationId는 선택 파라미터가 아니다 — 호출자가 항상 현재 로그인한 관리자의 조직을
  // 넘겨야 한다(멀티테넌시 1단계, V17). null을 넘기면 모든 조직의 계정이 섞여 보이는
  // 심각한 격리 결함이 되므로, 호출부에서 실수로 생략하기 어렵도록 keyword/role과 분리된
  // 필수 인자로 둔다.
  // includeInactive: 매핑 대상 선택 같은 "고를 사람" 용도는 항상 false로 둬 비활성 계정을 제외해야
  // 한다 — 반면 ADM-002 계정 목록처럼 관리자가 "비활성화한 계정을 다시 찾아 재활성화"해야 하는
  // 화면은 true로 넘겨야 한다(전체 프로세스 점검 중 발견: 예전엔 이 값이 없어 비활성화한 계정이
  // 목록에서 영영 사라지고 재활성화할 방법이 없었다).
  public static Specification<User> search(UUID organizationId, String keyword, String role, boolean includeInactive) {
    return (root, query, cb) -> {
      var predicates = cb.equal(root.get("organizationId"), organizationId);
      if (StringUtils.hasText(keyword)) {
        String pattern = "%" + keyword.trim().toLowerCase() + "%";
        predicates = cb.and(
            predicates,
            cb.or(
                cb.like(cb.lower(root.get("name")), pattern),
                cb.like(cb.lower(root.get("badgeNumber")), pattern),
                cb.like(cb.lower(root.get("team")), pattern)));
      }
      if (StringUtils.hasText(role) && !"ALL".equalsIgnoreCase(role)) {
        predicates = cb.and(predicates, cb.equal(root.get("role"), role));
      }
      if (!includeInactive) {
        predicates = cb.and(predicates, cb.notEqual(root.get("status"), "INACTIVE"));
      }
      return predicates;
    };
  }
}

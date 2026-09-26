package com.faind.domain.statistics.repository;

import com.faind.domain.incident.entity.AiJudgmentLog;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

// 코드구조설계서 §2 statistics 패키지 주석: "ai_judgment_logs 읽기 전용". incident 패키지가 쓰기를
// 소유하는 같은 테이블(ai_judgment_logs)을, DB설계서 §1 원칙 5(재사용 우선)에 따라 read model로
// 재사용한다 — 그래서 CRUD가 아닌 Spring Data 기본 Repository<T,ID>만 상속해 조회 메서드만 연다.
//
// 멀티테넌시 1단계: AiJudgmentLog는 Incident로의 JPA 연관관계가 없는 plain UUID 컬럼
// (relatedIncidentId)이라 파생 쿼리로 organizationId를 못 걸어 전부 명시적 @Query로 바꿨다.
// 서브쿼리로 "이 조직 소속 incident_id에 걸린 로그만" 걸러낸다 — 이걸 빼먹으면 ADM-009 통계
// 대시보드에 다른 조직 데이터가 그대로 섞여 나온다(실제로 발견된 유출).
public interface AiJudgmentLogQueryRepository extends Repository<AiJudgmentLog, UUID> {

  @Query("select count(l) from AiJudgmentLog l where l.judgmentType = :judgmentType "
      + "and l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId)")
  long countByJudgmentType(String judgmentType, UUID organizationId);

  // Phase 6 ADM-009: CCTV_DETECTION 중 "MANUAL"(ADM-010 관제실 수동 등록) 비율 계산용 분자.
  @Query("select count(l) from AiJudgmentLog l where l.judgmentType = :judgmentType and l.detectionSource = :detectionSource "
      + "and l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId)")
  long countByJudgmentTypeAndDetectionSource(String judgmentType, String detectionSource, UUID organizationId);

  @Query("select count(l) from AiJudgmentLog l "
      + "where l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId)")
  long count(UUID organizationId);

  // Phase 6 ADM-009: danger_score가 채워진(=CCTV_DETECTION) 로그의 평균 위험도. 값이 하나도
  // 없으면 null — "0"으로 보여주면 "평균적으로 안전했다"는 잘못된 신호가 되므로 그대로 null을 돌려준다.
  @Query("select avg(l.dangerScore) from AiJudgmentLog l where l.judgmentType = :judgmentType and l.dangerScore is not null "
      + "and l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId)")
  BigDecimal averageDangerScore(String judgmentType, UUID organizationId);

  @Query("select l from AiJudgmentLog l where l.createdAt > :after "
      + "and l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId) "
      + "order by l.createdAt asc")
  List<AiJudgmentLog> findByCreatedAtAfterOrderByCreatedAtAsc(LocalDateTime after, UUID organizationId);

  @Query("select avg(l.confidenceScore) from AiJudgmentLog l where l.judgmentType = :judgmentType "
      + "and l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId)")
  BigDecimal averageConfidenceScore(String judgmentType, UUID organizationId);

  @Query("select l.judgmentType, count(l) from AiJudgmentLog l "
      + "where l.relatedIncidentId in (select i.incidentId from Incident i where i.organizationId = :organizationId) "
      + "group by l.judgmentType")
  List<Object[]> countGroupedByJudgmentType(UUID organizationId);

  List<AiJudgmentLog> findByJudgmentTypeAndSourceDeviceIdIsNotNullOrderByCreatedAtDesc(String judgmentType);
}

-- 멀티테넌시 1단계 후속(2번 나머지 테이블 정리): 앵커(users/incidents/devices)에 FK가 전혀
-- 없어 JOIN으로도 격리되지 않는 테이블은 facility_profiles뿐이었다 — 시설별 위험물 정보(§V14)로,
-- 소방서/자체소방대마다 관할·소유 시설이 다르므로 조직별로 나눈다. 아직 이 테이블을 읽고 쓰는
-- 애플리케이션 코드가 없어(스키마만 존재) 백엔드/노드 서비스 변경은 필요 없다.
ALTER TABLE facility_profiles ADD COLUMN organization_id UUID REFERENCES organizations(organization_id);
UPDATE facility_profiles SET organization_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE facility_profiles ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_facility_profiles_organization_id ON facility_profiles(organization_id);

-- reports/training_sessions은 직접 organization_id를 두지 않는다:
--   reports: incident_id NOT NULL로 이미 incidents에 FK가 있고, 실제 조회 경로도
--     "본인이 작성한 보고서만"(author_id = 요청자) 소유권 검증으로 막혀 있어 다른 조직
--     보고서를 볼 수 없다 — V17의 "앵커에 FK가 있으면 직접 컬럼 불필요" 원칙 그대로 적용.
--   training_sessions: created_by NOT NULL로 users에 FK가 있다. notification-server
--     쪽 쿼리(operations.service.ts)가 이 FK를 거치지 않고 전체 훈련 세션을 조회하던 게
--     실제 문제였으므로, 이번 마이그레이션이 아니라 그 서비스 코드에서 JOIN 조건으로 고친다.

-- sop_documents(V16)는 의도적으로 조직 구분을 두지 않는다: 공식 SOP 조항(§4.2 무전 보고 원칙
-- 등 국가/공통 소방 절차 인용)을 담은 공용 참조 라이브러리이고, 호출 경로 자체가
-- InternalServiceAuthFilter를 쓰는 ai-server↔backend 내부 콜백이라 로그인 사용자(조직) 컨텍스트가
-- 없다(SopSearchController). 조직별 SOP가 필요해지면 그때 별도로 스키마를 바꾼다.

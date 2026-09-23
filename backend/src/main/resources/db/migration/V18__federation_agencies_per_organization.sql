-- 멀티테넌시 1단계 후속: federation_agencies(V12)는 organization_id가 없어 모든 조직이 같은
-- "신뢰 기관 디렉터리"를 공유하고 있었다. agency_code가 전역 유일이라, 한 조직의 관리자가
-- 다른 조직이 이미 등록한 agency_code로 다시 등록하면 그 파트너 기관의 인증서 지문
-- (certificate_fingerprint)을 덮어써 버리는 신뢰 탈취(trust hijack) 결함이 있었다.
--
-- federation은 "이 시스템 배포판이 조직 외부의 다른 시스템/기관과 사건 데이터를 공유"하는
-- 기능이고, organizations(V17)는 "같은 배포판 안에서 여러 조직이 격리되어 공유"하는 것이다 —
-- 별개 개념이지만, 실제로는 조직마다 자기가 신뢰하는 외부 파트너 기관 목록이 다르므로
-- (예: 공설소방서의 인접 소방서 목록과 자체소방대의 관할 소방서는 서로 다르다) 이 디렉터리
-- 자체도 조직별로 나눈다.
ALTER TABLE federation_agencies ADD COLUMN organization_id UUID REFERENCES organizations(organization_id);
UPDATE federation_agencies SET organization_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE federation_agencies ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE federation_agencies DROP CONSTRAINT federation_agencies_agency_code_key;
ALTER TABLE federation_agencies ADD CONSTRAINT uq_federation_agencies_org_code UNIQUE (organization_id, agency_code);

CREATE INDEX idx_federation_agencies_organization_id ON federation_agencies(organization_id);

-- federation_shares는 organization_id를 직접 두지 않는다 — incident_id를 통해
-- incidents.organization_id로, agency_id를 통해 federation_agencies.organization_id로
-- 이미 간접 격리되며(양쪽 다 애플리케이션 레벨에서 같은 조직인지 검증한다), V17이 다른
-- 앵커 아닌 테이블에 적용한 것과 같은 원칙이다.

-- 멀티테넌시 1단계: 공설소방서와 대기업 자체소방대(자위소방대, 위험물안전관리법상 의무 설치
-- 대상 시설)가 하나의 시스템을 독립적으로 공유해 쓸 수 있도록 조직 단위로 데이터를 분리한다.
-- federation_agencies/federation_shares(V12)는 "서로 다른 시스템 간" 특정 사건 공유용이고,
-- 이건 "같은 시스템 안 여러 조직"을 격리하는 것이라 별개 개념이다 — 혼동하지 말 것.
--
-- 1단계 범위: users/incidents/devices 3개 앵커 테이블만 조직으로 나눈다. 나머지 테이블은
-- 대부분 이 세 테이블에 FK로 걸려 있어 JOIN을 통해 자연히 격리된다(예: incident_events는
-- incidents.organization_id를 통해). 직접 organization_id가 필요한 나머지 테이블(facility_profiles,
-- reports, training_sessions, sop_documents 등)은 2단계로 남겨둔다.
CREATE TABLE organizations (
    organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- 로그인 시 사용자가 입력하는 짧은 식별자. 예: SEOUL-FIRE(서울소방본부), SAMSUNG-ULSAN(자체소방대).
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(15) NOT NULL CHECK (type IN ('PUBLIC', 'CORPORATE')),
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 마이그레이션 이전 단일 배포 데이터(E2E 계정 등)를 위한 기본 조직. 실제 다중 조직 운영은
-- 이후 관리자가 새 조직을 등록해 code로 구분한다.
INSERT INTO organizations(organization_id, code, name, type)
VALUES ('00000000-0000-0000-0000-000000000001', 'DEFAULT', '기본 조직(마이그레이션 이전 데이터)', 'PUBLIC');

ALTER TABLE users ADD COLUMN organization_id UUID REFERENCES organizations(organization_id);
UPDATE users SET organization_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;
-- badge_number는 지금까지 전역 유일이었다 — 조직마다 독립적으로 배정하는 사번 체계를 쓸 수
-- 있도록(서로 다른 두 조직이 같은 배지번호를 각자 발급해도 충돌하지 않도록) 조직 단위 유일로 바꾼다.
ALTER TABLE users DROP CONSTRAINT users_badge_number_key;
ALTER TABLE users ADD CONSTRAINT uq_users_org_badge UNIQUE (organization_id, badge_number);

ALTER TABLE incidents ADD COLUMN organization_id UUID REFERENCES organizations(organization_id);
UPDATE incidents SET organization_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE incidents ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE devices ADD COLUMN organization_id UUID REFERENCES organizations(organization_id);
UPDATE devices SET organization_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE devices ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_incidents_organization_id ON incidents(organization_id);
CREATE INDEX idx_devices_organization_id ON devices(organization_id);

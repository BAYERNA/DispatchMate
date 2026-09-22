-- 조직 온보딩 이후 남아있던 gap: assurance의 데이터 보존(retention) preview/execute 흐름이
-- organization_id 없이 전체 배포를 대상으로 cutoff만으로 후보를 세고 실제로 지우고/익명화했다
-- (radio_transcripts/indoor_position_updates/evidence_assets/immutable_audit_events는 이미
-- incidents로 FK가 있으므로 그 조인으로 조직을 알 수 있다 — 이 테이블들 자체에는 컬럼을
-- 추가하지 않는다). retention_execution_plans만 "이 실행 계획을 누가 어느 조직 몫으로
-- 만들었는지" 추적할 단서가 없었으므로 여기에만 organization_id를 추가한다.
ALTER TABLE retention_execution_plans ADD COLUMN organization_id UUID REFERENCES organizations(organization_id);

UPDATE retention_execution_plans
SET organization_id = (SELECT organization_id FROM organizations WHERE code = 'DEFAULT')
WHERE organization_id IS NULL;

ALTER TABLE retention_execution_plans ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_retention_execution_plans_org ON retention_execution_plans(organization_id, created_at DESC);

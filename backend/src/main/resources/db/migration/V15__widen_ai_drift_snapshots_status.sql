-- ai_drift_snapshots.drift_status는 VARCHAR(15)였지만 CHECK 허용값 중
-- 'INSUFFICIENT_DATA'가 17자라 자기 자신의 제약을 만족시킬 수 없었다 — 표본이
-- 20건 미만인(사실상 모든 신규/저사용 환경의 기본 상태) 매 드리프트 측정마다
-- "value too long for type character varying(15)"로 실패했다.
ALTER TABLE ai_drift_snapshots ALTER COLUMN drift_status TYPE VARCHAR(20);

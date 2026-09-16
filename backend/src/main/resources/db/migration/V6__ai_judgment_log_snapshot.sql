-- ADM-001 "AI 의심감지 대기열": 관제실이 신뢰도 숫자만 보고 확인/오탐을 결정해야 했다 — 감지 순간
-- 카메라가 실제로 무엇을 봤는지 확인할 방법이 없었다(스트림을 다시 열어보기 전에는). CCTV_DETECTION
-- 로그에 감지 박스가 그려진 증거 스냅샷(JPEG, base64)을 함께 남긴다. 감지 안 된 경우·구버전 로그는
-- NULL로 남아 UI에서 "스냅샷 없음"으로 표시된다.
ALTER TABLE ai_judgment_logs ADD COLUMN snapshot_base64 TEXT;

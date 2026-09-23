-- 비행 전 규제 체크(FAIND 사업계획서 "관제권/비행금지구역 사전 확인"): 드론 배정 전 목표 좌표가
-- 비행금지구역 반경 안인지 확인하는 게이트의 데이터. 실제 국토교통부 비행금지구역 API 연동 전까지는
-- 여기 담긴 구역이 예시/데모 데이터라는 점을 명확히 한다 — 실존 관제권 좌표가 아니다.
-- fire_risk_regions와 같은 이유로 organizations와 무관한 공유 참조 데이터라 organization_id를 두지 않는다.
CREATE TABLE no_fly_zones (
  zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_name VARCHAR(100) NOT NULL,
  zone_type VARCHAR(30) NOT NULL,
  center_latitude NUMERIC(9,6) NOT NULL,
  center_longitude NUMERIC(9,6) NOT NULL,
  radius_km NUMERIC(6,2) NOT NULL CHECK (radius_km > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 데모용 예시 구역(실존 관제권 좌표 아님) — 화면·테스트에서 게이트가 실제로 작동함을 보여주기 위한 시드.
INSERT INTO no_fly_zones (zone_name, zone_type, center_latitude, center_longitude, radius_km, active) VALUES
  ('예시 비행금지구역 A (데모)', 'DEMO', 37.4000, 127.1000, 3.0, TRUE),
  ('예시 비행금지구역 B (데모)', 'DEMO', 35.2000, 129.0500, 2.0, TRUE);

-- Fire Risk Score: 지역(시군구) 단위 화재 위험도. FAIND 사업계획서(드론 자동배차 기획)의 위험도
-- 산출 개념을 소프트웨어로 옮긴 것이다. organizations와 무관한 공유 참조 데이터라(소방청
-- 화재이력·국토교통부 건축HUB 공공데이터 연동과 같은 성격 — PublicDataApiAdapter 참조)
-- organization_id를 두지 않는다.
CREATE TABLE fire_risk_regions (
  region_code VARCHAR(20) PRIMARY KEY,
  region_name VARCHAR(100) NOT NULL,
  fire_count_5y INTEGER NOT NULL,
  response_time_p90_seconds INTEGER NOT NULL,
  casualty_total INTEGER NOT NULL,
  night_fire_ratio NUMERIC(5,2) NOT NULL,
  high_risk_structure_ratio NUMERIC(5,2) NOT NULL,
  negligence_fire_ratio NUMERIC(5,2) NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL,
  risk_grade VARCHAR(4) NOT NULL CHECK (risk_grade IN ('상', '중', '하')),
  computed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_fire_risk_regions_score ON fire_risk_regions(risk_score DESC);

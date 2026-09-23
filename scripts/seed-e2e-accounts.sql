-- Playwright E2E 테스트 전용 계정 3개(ADMIN/COMMANDER/RESPONDER)를 멱등하게(idempotent) 심는다.
-- admin-web/commander-tablet/responder-app의 e2e/global-setup.ts가 매 테스트 실행 전에 이 파일을
-- psql로 적용한다. 비밀번호는 모두 "Test1234!"이며(BCrypt 해시), 세 앱이 공유하는 값이므로
-- 이 파일이 유일한 출처다 — 각 앱 e2e 코드에 평문을 다시 적지 않고 여기 주석에만 남긴다.
-- 멀티테넌시 1단계(V17) 이후 badge_number 유일 제약이 (organization_id, badge_number)로
-- 바뀌었으므로, DEFAULT 조직(V17이 고정 UUID로 심어두는 마이그레이션 전 단일배포용 조직)에
-- 명시적으로 소속시키고 ON CONFLICT도 그 복합 제약을 대상으로 한다.
INSERT INTO users (organization_id, name, role, badge_number, password_hash, is_initial_password, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'E2E 관리자', 'ADMIN', 'E2E-ADMIN', '$2b$10$94Ptkd/kAkxEfoL5Vc0bmOalSFpNPRlOcnHY7hbfRqylUcIFiWfuC', false, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', 'E2E 지휘관', 'COMMANDER', 'E2E-COMMANDER', '$2b$10$94Ptkd/kAkxEfoL5Vc0bmOalSFpNPRlOcnHY7hbfRqylUcIFiWfuC', false, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', 'E2E 대원', 'RESPONDER', 'E2E-RESPONDER', '$2b$10$94Ptkd/kAkxEfoL5Vc0bmOalSFpNPRlOcnHY7hbfRqylUcIFiWfuC', false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_users_org_badge DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_initial_password = false,
  status = 'ACTIVE';

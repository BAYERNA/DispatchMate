-- Playwright E2E 테스트 전용 계정 3개(ADMIN/COMMANDER/RESPONDER)를 멱등하게(idempotent) 심는다.
-- admin-web/commander-tablet/responder-app의 e2e/global-setup.ts가 매 테스트 실행 전에 이 파일을
-- psql의 e2e_password 변수로 전달된 실행별 비밀번호를 pgcrypto에서 BCrypt 해시한다.
-- 예: psql -v e2e_password="$E2E_TEST_PASSWORD" -f scripts/seed-e2e-accounts.sql
-- 멀티테넌시 1단계(V17) 이후 badge_number 유일 제약이 (organization_id, badge_number)로
-- 바뀌었으므로, DEFAULT 조직(V17이 고정 UUID로 심어두는 마이그레이션 전 단일배포용 조직)에
-- 명시적으로 소속시키고 ON CONFLICT도 그 복합 제약을 대상으로 한다.
INSERT INTO users (organization_id, name, role, badge_number, password_hash, is_initial_password, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'E2E 관리자', 'ADMIN', 'E2E-ADMIN', crypt(:'e2e_password', gen_salt('bf', 10)), false, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', 'E2E 지휘관', 'COMMANDER', 'E2E-COMMANDER', crypt(:'e2e_password', gen_salt('bf', 10)), false, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', 'E2E 대원', 'RESPONDER', 'E2E-RESPONDER', crypt(:'e2e_password', gen_salt('bf', 10)), false, 'ACTIVE')
ON CONFLICT ON CONSTRAINT uq_users_org_badge DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_initial_password = false,
  status = 'ACTIVE';

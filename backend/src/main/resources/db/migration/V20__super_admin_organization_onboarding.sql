-- 멀티테넌시 1단계 마지막 조각: "슈퍼관리자가 조직을 만들고 첫 ADMIN 계정을 발급하는 화면".
-- 지금까지의 ADMIN/COMMANDER/RESPONDER는 전부 organization_id로 스코프된 역할이라, 새 조직
-- 자체를 만들 권한을 가진 역할이 없었다 — SUPER_ADMIN을 새로 추가한다. 다른 역할과 마찬가지로
-- users.organization_id NOT NULL 제약은 유지한다(소속 없는 계정을 허용하지 않는다는 원칙은
-- 그대로 두고, SUPER_ADMIN도 편의상 DEFAULT 조직에 귀속시킨다).
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'COMMANDER', 'RESPONDER'));

-- 부트스트랩 계정 — 이게 없으면 SUPER_ADMIN으로 로그인할 방법 자체가 없다(일반 ADMIN은
-- SUPER_ADMIN 계정을 발급할 수 없도록 AccountRequest에서 role을 ADMIN/COMMANDER/RESPONDER로만
-- 제한해 뒀다). 초기 비밀번호는 CMN-002 흐름대로 최초 로그인 시 강제로 재설정된다.
-- 임시 비밀번호: ChangeMe123! (배포 시 즉시 변경 요구 — is_initial_password=true).
INSERT INTO users(organization_id, name, role, badge_number, password_hash, is_initial_password)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '슈퍼관리자',
    'SUPER_ADMIN',
    'SUPERADMIN',
    '$2b$10$GYsAnYcwK4qSOVKD3XA6XORh5yM1rd3CU5sNddvk2t1216es5mUtC',
    true
);

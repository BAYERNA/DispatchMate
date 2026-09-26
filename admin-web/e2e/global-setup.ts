import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// E2E 테스트 전용 계정 3개를 심고(레포 공유 scripts/seed-e2e-accounts.sql), 이전 실행에서
// 로그인 실패 테스트가 쌓아둔 레이트리미팅 카운터(Phase 10 보안 강화)를 지워 매 실행이
// 이전 실행 상태에 좌우되지 않게 한다.
export default async function globalSetup() {
  const e2ePassword = process.env.E2E_TEST_PASSWORD
  if (!e2ePassword) throw new Error('E2E_TEST_PASSWORD is required')
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const sqlPath = path.join(repoRoot, 'scripts', 'seed-e2e-accounts.sql')

  const pgEnv = {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD ?? 'faind',
  }
  execFileSync(
    'psql',
    [
      '-h', process.env.DB_HOST ?? 'localhost',
      '-p', process.env.DB_PORT ?? '5432',
      '-U', process.env.DB_USERNAME ?? 'faind',
      '-d', process.env.DB_NAME ?? 'faind',
      '-v', 'ON_ERROR_STOP=1',
      '-v', `e2e_password=${e2ePassword}`,
      '-f', sqlPath,
    ],
    { env: pgEnv, stdio: 'inherit' },
  )

  try {
    execFileSync(
      'redis-cli',
      [
        '-h', process.env.REDIS_HOST ?? 'localhost',
        '-p', process.env.REDIS_PORT ?? '6379',
        'del', 'login:attempts:E2E-ADMIN', 'login:attempts:E2E-COMMANDER', 'login:attempts:E2E-RESPONDER',
      ],
      { stdio: 'ignore' },
    )
  } catch {
    // Redis 접근이 안 되면 backend 자체가 이미 뜨지 못했을 것이므로, 여기서는 무시하고
    // 뒤이은 webServer 헬스체크 실패로 자연스럽게 드러나게 둔다.
  }
}

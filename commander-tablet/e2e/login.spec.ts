import { test, expect } from '@playwright/test'

// CMN-001 통합 로그인 (FR-01). 비밀번호는 scripts/seed-e2e-accounts.sql 주석 참조.
const E2E_COMMANDER_PASSWORD = process.env.E2E_TEST_PASSWORD
if (!E2E_COMMANDER_PASSWORD) throw new Error('E2E_TEST_PASSWORD is required')

test.describe('CMN-001 로그인', () => {
  test('사번·비밀번호가 맞으면 CMD-001 출동지령·사전분석 화면으로 이동한다', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('아이디 (사번)').fill('E2E-COMMANDER')
    await page.getByLabel('비밀번호').fill(E2E_COMMANDER_PASSWORD)
    await page.getByRole('button', { name: '로그인' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1, name: '출동지령·사전분석' })).toBeVisible()
  })

  test('비밀번호가 틀리면 에러 배너를 보여주고 로그인 화면에 남는다', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('아이디 (사번)').fill('E2E-COMMANDER')
    await page.getByLabel('비밀번호').fill('wrong-password')
    await page.getByRole('button', { name: '로그인' }).click()

    await expect(page.getByText('아이디 또는 비밀번호가 올바르지 않습니다.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('로그인하지 않고 보호된 화면에 접근하면 로그인 화면으로 리다이렉트된다', async ({ page }) => {
    await page.goto('/incidents/00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL(/\/login$/)
  })
})

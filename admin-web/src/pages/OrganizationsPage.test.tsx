import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import * as organizationsApi from '../api/organizations'
import { OrganizationsPage } from './OrganizationsPage'

vi.mock('../api/organizations')

// 이 프로젝트의 vitest 설정에는 testing-library 자동 cleanup이 붙어있지 않다 — it()마다
// render()를 새로 호출하므로 명시적으로 정리한다(RequireAuth.test.tsx와 동일한 이유).
afterEach(cleanup)

const SUPER_ADMIN_USER = { userId: 'u1', name: '슈퍼관리자', role: 'SUPER_ADMIN' as const, initialPassword: false }

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <AuthContext.Provider
      value={{
        user: SUPER_ADMIN_USER,
        isAuthenticated: true,
        login: async () => {
          throw new Error('not used')
        },
        completeInitialPassword: () => {},
        logout: () => {},
      }}
    >
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OrganizationsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>,
  )
}

// 조직 온보딩(6번) 핵심 계약: 새 조직을 등록하면 목록이 갱신되고, 기존 조직에 첫 ADMIN
// 계정을 발급하면 발급된 임시 비밀번호가 1회만 화면에 표시되는지 — AccountFormPage의
// issuedPassword 표시 원칙과 동일하게 지켜야 한다.
describe('OrganizationsPage', () => {
  beforeEach(() => {
    vi.mocked(organizationsApi.listOrganizations).mockResolvedValue([
      {
        organizationId: 'org-1',
        code: 'SEOUL-FIRE',
        name: '서울소방본부',
        type: 'PUBLIC',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00',
      },
    ])
  })

  it('조직 목록을 불러와 보여준다', async () => {
    renderPage()
    expect(await screen.findByText('서울소방본부')).toBeTruthy()
    expect(screen.getByText('SEOUL-FIRE')).toBeTruthy()
  })

  it('새 조직을 등록하면 목록을 다시 불러온다', async () => {
    vi.mocked(organizationsApi.createOrganization).mockResolvedValue({
      organizationId: 'org-2',
      code: 'SAMSUNG-ULSAN',
      name: '삼성 울산 자체소방대',
      type: 'CORPORATE',
      status: 'ACTIVE',
      createdAt: '2026-02-01T00:00:00',
    })
    renderPage()
    await screen.findByText('서울소방본부')

    fireEvent.change(screen.getByLabelText('조직 코드'), { target: { value: 'SAMSUNG-ULSAN' } })
    fireEvent.change(screen.getByLabelText('조직명'), { target: { value: '삼성 울산 자체소방대' } })
    fireEvent.change(screen.getByLabelText('조직 유형'), { target: { value: 'CORPORATE' } })
    fireEvent.click(screen.getByRole('button', { name: '조직 등록' }))

    await waitFor(() =>
      expect(organizationsApi.createOrganization).toHaveBeenCalledWith({
        code: 'SAMSUNG-ULSAN',
        name: '삼성 울산 자체소방대',
        type: 'CORPORATE',
      }),
    )
    await waitFor(() => expect(organizationsApi.listOrganizations).toHaveBeenCalledTimes(2))
  })

  it('첫 ADMIN 계정을 발급하면 임시 비밀번호가 1회 표시된다', async () => {
    vi.mocked(organizationsApi.issueFirstAdmin).mockResolvedValue({
      account: {
        userId: 'u2',
        name: '홍길동',
        role: 'ADMIN',
        badgeNumber: 'A0001',
        team: null,
        phone: null,
        status: 'ACTIVE',
        updatedAt: null,
      },
      issuedTemporaryPassword: 'temp-pw-123',
    })
    renderPage()
    await screen.findByText('서울소방본부')

    fireEvent.click(screen.getByRole('button', { name: '첫 ADMIN 계정 발급' }))
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '홍길동' } })
    fireEvent.change(screen.getByLabelText('사번'), { target: { value: 'A0001' } })
    fireEvent.click(screen.getByRole('button', { name: '발급' }))

    await waitFor(() =>
      expect(organizationsApi.issueFirstAdmin).toHaveBeenCalledWith('org-1', {
        name: '홍길동',
        badgeNumber: 'A0001',
        team: '',
        phone: '',
      }),
    )
    expect(await screen.findByText('temp-pw-123')).toBeTruthy()
    expect(screen.getByText(/서울소방본부의 첫 ADMIN 임시 비밀번호/)).toBeTruthy()
    // 발급 폼은 성공 후 닫혀야 한다.
    expect(screen.queryByLabelText('사번')).toBeNull()
  })

  it('조직 코드 중복 에러는 배너로 보여준다', async () => {
    const { ApiError } = await import('../api/client')
    vi.mocked(organizationsApi.createOrganization).mockRejectedValue(
      new ApiError(409, { code: 'E409_05', message: '이미 사용 중인 조직 코드입니다.', timestamp: '', fieldErrors: [] }),
    )
    renderPage()
    await screen.findByText('서울소방본부')

    fireEvent.change(screen.getByLabelText('조직 코드'), { target: { value: 'SEOUL-FIRE' } })
    fireEvent.change(screen.getByLabelText('조직명'), { target: { value: '중복' } })
    fireEvent.click(screen.getByRole('button', { name: '조직 등록' }))

    expect(await screen.findByText('이미 사용 중인 조직 코드입니다.')).toBeTruthy()
  })
})

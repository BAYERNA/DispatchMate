import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthContext } from './AuthContext'
import { RequireAuth } from './RequireAuth'
import type { Role } from '../types'

// 이 프로젝트의 vitest 설정에는 testing-library의 자동 cleanup이 붙어있지 않다 —
// 이 파일은 it()마다 render()를 새로 호출하므로 명시적으로 정리해야 이전 테스트의
// DOM이 남아 다음 단언을 오염시키지 않는다.
afterEach(cleanup)

interface MockUser {
  userId: string
  name: string
  role: Role
  initialPassword: boolean
}

function renderWithUser(user: MockUser | null, allowedRoles?: Role[]) {
  return render(
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        login: async () => {
          throw new Error('not used')
        },
        completeInitialPassword: () => {},
        logout: () => {},
      }}
    >
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>로그인 화면</div>} />
          <Route path="/initial-password" element={<div>최초 비밀번호 설정 화면</div>} />
          <Route
            path="/protected"
            element={
              <RequireAuth allowedRoles={allowedRoles}>
                <div>보호된 화면</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

// 조직 온보딩(6번)으로 SUPER_ADMIN 역할이 추가되면서 RequireAuth가 allowedRoles를
// 받도록 바뀌었다 — 기존 ADMIN 전용 화면 동작이 안 깨지는지, 새 SUPER_ADMIN 전용
// 화면(예: /organizations)이 서로의 화면에 잘못 들어가지 않는지가 핵심 검증 대상.
describe('RequireAuth', () => {
  it('로그인하지 않았으면 로그인 화면으로 보낸다', () => {
    renderWithUser(null)
    expect(screen.getByText('로그인 화면')).toBeTruthy()
  })

  it('최초 비밀번호 설정이 안 끝났으면 그 화면으로 보낸다', () => {
    renderWithUser({ userId: 'u1', name: '홍길동', role: 'ADMIN', initialPassword: true })
    expect(screen.getByText('최초 비밀번호 설정 화면')).toBeTruthy()
  })

  it('allowedRoles를 생략하면 기본값대로 ADMIN만 통과한다', () => {
    renderWithUser({ userId: 'u1', name: '홍길동', role: 'ADMIN', initialPassword: false })
    expect(screen.getByText('보호된 화면')).toBeTruthy()
  })

  it('allowedRoles를 생략했을 때 SUPER_ADMIN은 여전히 관리자 콘솔에 못 들어간다', () => {
    renderWithUser({ userId: 'u1', name: '슈퍼관리자', role: 'SUPER_ADMIN', initialPassword: false })
    expect(screen.getByText('접근 권한이 없습니다')).toBeTruthy()
    expect(screen.queryByText('보호된 화면')).toBeNull()
  })

  it('SUPER_ADMIN 전용 화면에는 ADMIN이 못 들어간다', () => {
    renderWithUser({ userId: 'u1', name: '홍길동', role: 'ADMIN', initialPassword: false }, ['SUPER_ADMIN'])
    expect(screen.getByText('접근 권한이 없습니다')).toBeTruthy()
  })

  it('SUPER_ADMIN 전용 화면에는 SUPER_ADMIN이 들어갈 수 있다', () => {
    renderWithUser({ userId: 'u1', name: '슈퍼관리자', role: 'SUPER_ADMIN', initialPassword: false }, ['SUPER_ADMIN'])
    expect(screen.getByText('보호된 화면')).toBeTruthy()
  })
})

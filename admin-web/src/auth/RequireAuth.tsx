import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import type { Role } from '../types'

// CMN-001 annot#2: 최초 로그인 시 CMN-002로 강제 이동 (is_initial_password = true)
// allowedRoles 기본값은 기존 관리자 콘솔 동작을 그대로 유지한다 — 조직 온보딩(6번)처럼
// SUPER_ADMIN 전용 화면만 명시적으로 다른 값을 넘긴다.
export function RequireAuth({
  children,
  allowedRoles = ['ADMIN'],
}: {
  children: ReactNode
  allowedRoles?: Role[]
}) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user.initialPassword && location.pathname !== '/initial-password') {
    return <Navigate to="/initial-password" replace />
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div style={{ padding: 32, fontFamily: 'var(--font-sans)' }}>
        <h2>접근 권한이 없습니다</h2>
        <p>이 화면은 {allowedRoles.join(', ')} 역할 계정만 사용할 수 있습니다.</p>
      </div>
    )
  }

  return <>{children}</>
}

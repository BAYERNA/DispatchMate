import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import './AdminLayout.css'

const NAV_ITEMS = [
  { to: '/', label: 'ADM-001 관리자 홈', end: true },
  { to: '/accounts', label: 'ADM-002 대원 계정 목록' },
  { to: '/devices', label: 'ADM-006 기기 등록·매핑' },
  { to: '/cctv-monitor', label: 'ADM-010 전체 CCTV 상시 감시' },
  { to: '/statistics', label: 'ADM-009 기관 통계 대시보드' },
  { to: '/operations', label: 'ADM-OPS 운영 준비·AI 모델' },
  { to: '/intelligence', label: 'ADM-SRE 관측성·연동' },
  { to: '/governance', label: 'ADM-GOV 복원력·거버넌스' },
]

// 조직 온보딩(6번): SUPER_ADMIN은 개별 조직의 관리자 콘솔(ADM-*)에 들어갈 수 없고
// 조직 관리 화면만 사용하므로 별도의 축소된 내비게이션을 쓴다.
const SUPER_ADMIN_NAV_ITEMS = [
  { to: '/organizations', label: '조직 관리', end: true },
  { to: '/no-fly-zones', label: '비행금지구역 관리' },
]

export function AdminLayout({ children, title, screenId }: { children: ReactNode; title: string; screenId: string }) {
  const { user, logout } = useAuth()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const navItems = isSuperAdmin ? SUPER_ADMIN_NAV_ITEMS : NAV_ITEMS

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          출동메이트<span>.</span>
        </div>
        <div className="subtitle">{isSuperAdmin ? '슈퍼관리자 콘솔' : '관리자 콘솔'}</div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            {user?.name} <span className="tag role-admin">{user?.role}</span>
          </div>
          <button type="button" className="wf-btn small" onClick={logout}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-topbar">
          <div className="screen-id">{screenId}</div>
          <h1>{title}</h1>
        </div>
        <div className="admin-canvas">{children}</div>
      </main>
    </div>
  )
}

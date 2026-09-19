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
]

export function AdminLayout({ children, title, screenId }: { children: ReactNode; title: string; screenId: string }) {
  const { user, logout } = useAuth()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          출동메이트<span>.</span>
        </div>
        <div className="subtitle">관리자 콘솔</div>
        <nav>
          {NAV_ITEMS.map((item) => (
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
            {user?.name} <span className="tag role-admin">ADMIN</span>
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

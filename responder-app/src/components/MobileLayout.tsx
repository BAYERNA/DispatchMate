import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import './MobileLayout.css'
import { AccessibilityControls } from './AccessibilityControls'

const NAV_ITEMS = [
  { to: '/', label: 'USR-001 현장', end: true },
  { to: '/reports', label: 'USR-002 보고서' },
]

interface MobileLayoutProps {
  children: ReactNode
  title: string
  screenId: string
  onBack?: () => void
  wsConnected?: boolean
}

// 대원 앱은 현장에서 한 손으로 조작하는 것을 전제로, admin-web/commander-tablet과 달리
// 좁은 단일 컬럼 + 하단 탭바 레이아웃을 쓴다 (태블릿의 넓은 화면과는 다른 폼팩터).
export function MobileLayout({ children, title, screenId, onBack, wsConnected }: MobileLayoutProps) {
  const { user, logout } = useAuth()

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <div className="mobile-topbar-row">
          {onBack && (
            <button type="button" className="wf-btn small" onClick={onBack}>
              ← 뒤로
            </button>
          )}
          <div className="mobile-topbar-title">
            <div className="screen-id">{screenId}</div>
            <h1>{title}</h1>
          </div>
        </div>
        <div className="mobile-topbar-row">
          {wsConnected !== undefined && (
            <span className={`ws-indicator ${wsConnected ? 'connected' : 'disconnected'}`}>
              {wsConnected ? '● 실시간 연결됨' : '○ 연결 끊김'}
            </span>
          )}
          <span className="mobile-user">
            {user?.name} <span className="tag role-responder">RESPONDER</span>
          </span>
          <AccessibilityControls />
          <button type="button" className="wf-btn small" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="mobile-canvas">{children}</main>

      <nav className="mobile-tabbar">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

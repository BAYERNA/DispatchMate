import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import './TabletLayout.css'

interface TabletLayoutProps {
  children: ReactNode
  title: string
  screenId: string
  onBack?: () => void
  wsConnected?: boolean
}

// 지휘관 태블릿은 관리자 웹과 달리 사이드바 없이 상단바 하나로 CMD-001→002→003 드릴다운 흐름을 안내한다
// (와이어프레임의 태블릿 폭 레이아웃 — 좌우 여백보다 현장 정보 표시 영역을 우선).
export function TabletLayout({ children, title, screenId, onBack, wsConnected }: TabletLayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="tablet-shell">
      <header className="tablet-topbar">
        <div className="tablet-topbar-left">
          {onBack && (
            <button type="button" className="wf-btn small" onClick={onBack}>
              ← 뒤로
            </button>
          )}
          <div>
            <div className="screen-id">{screenId}</div>
            <h1>{title}</h1>
          </div>
        </div>
        <div className="tablet-topbar-right">
          {wsConnected !== undefined && (
            <span className={`ws-indicator ${wsConnected ? 'connected' : 'disconnected'}`}>
              {wsConnected ? '● 실시간 연결됨' : '○ 연결 끊김'}
            </span>
          )}
          <span className="tablet-user">
            {user?.name} <span className="tag role-commander">COMMANDER</span>
          </span>
          <button type="button" className="wf-btn small" onClick={() => navigate('/')}>
            출동 목록
          </button>
          <button type="button" className="wf-btn small" onClick={() => navigate('/drones/map')}>
            드론 지도
          </button>
          <button type="button" className="wf-btn small" onClick={() => navigate('/training')}>훈련</button>
          <button type="button" className="wf-btn small" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="tablet-canvas">{children}</main>
    </div>
  )
}

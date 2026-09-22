import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Sentry } from '../monitoring/sentry'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// 렌더 중 예외가 나면 화면 전체가 백지로 죽던 걸 막는다 — 관리자 콘솔 어딘가 한 화면이
// 깨져도 로그인·새로고침 정도로 복구할 수 있어야 한다.
// captureException은 VITE_SENTRY_DSN이 없으면(monitoring/sentry.ts에서 init을 안 함) 조용히
// no-op되므로, DSN 미설정 환경(로컬 개발 등)에서도 이 코드는 안전하다.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 처리되지 않은 렌더링 오류', error, info.componentStack)
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="wf" style={{ maxWidth: 420, margin: '80px auto' }}>
          <div className="wf-header alert">
            <span>예상치 못한 오류</span>
          </div>
          <div className="wf-body">
            <p style={{ marginTop: 0 }}>화면을 표시하는 중 문제가 발생했습니다. 새로고침해 주세요.</p>
            <button type="button" className="wf-btn primary" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

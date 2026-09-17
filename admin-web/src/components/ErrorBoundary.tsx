import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// 렌더 중 예외가 나면 화면 전체가 백지로 죽던 걸 막는다 — 관리자 콘솔 어딘가 한 화면이
// 깨져도 로그인·새로고침 정도로 복구할 수 있어야 한다.
// componentDidCatch는 향후 모니터링(Sentry 등)을 붙일 때 이 한 곳만 바꾸면 되는 지점이다 —
// 지금은 실제 계정/DSN이 없어 SDK를 새로 추가하지 않고 console.error로 남긴다.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 처리되지 않은 렌더링 오류', error, info.componentStack)
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

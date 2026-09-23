import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../api/client'
import { Banner } from '../components/Banner'
import './LoginPage.css'

// CMN-001 통합로그인 (FR-01)
export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [badgeNumber, setBadgeNumber] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const user = await login(badgeNumber, password)
      // CMN-001 annot#1: 역할은 계정에 종속되어 로그인 후 자동 라우팅.
      // CMN-001 annot#2: 최초 로그인 시 CMN-002로 강제 이동.
      if (user.initialPassword) {
        navigate('/initial-password', { replace: true })
      } else if (user.role === 'SUPER_ADMIN') {
        // 슈퍼관리자는 ADMIN 전용 관리자 콘솔(RequireAuth 기본값)에 들어갈 수 없으므로
        // 조직 온보딩 화면으로 보낸다.
        navigate('/organizations', { replace: true })
      } else {
        const from = (location.state as { from?: Location })?.from?.pathname ?? '/'
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="login-hero-brand">출동메이트</div>
        <div>
          <div className="login-hero-title">
            현장의 판단을,
            <br />
            데이터로 잇습니다
          </div>
          <div className="login-hero-sub">AI 화재감지·드론출동·현장판단 · 신고접수부터 복귀까지</div>
        </div>
        <div className="login-hero-footer">출동메이트 — AI가 화재를 감지하고 골든타임을 사수합니다</div>
      </div>
      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-title">로그인</div>
          <div>
            <label className="field-label" htmlFor="orgSelect">
              기관선택
            </label>
            <select id="orgSelect" className="wf-field" defaultValue="OO소방서" disabled>
              <option>OO소방서</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="badgeNumber">
              아이디 (사번)
            </label>
            <input
              id="badgeNumber"
              className="wf-field"
              value={badgeNumber}
              onChange={(e) => setBadgeNumber(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              className="wf-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="wf-btn primary login-submit" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
          {error && <Banner kind="error" message={error} />}
        </form>
      </div>
    </div>
  )
}

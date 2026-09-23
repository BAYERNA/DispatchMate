import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { setInitialPassword } from '../api/auth'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../api/client'
import { Banner } from '../components/Banner'

const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

// CMN-002 최초 접속 비밀번호 설정 (FR-01)
// annot: "지난 QA에서 이 화면 자체가 뜨지 않는 누락 이슈가 있었음" — RequireAuth에서 강제 이동을 보장한다.
export function SetInitialPasswordPage() {
  const { completeInitialPassword, user } = useAuth()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError('8자 이상, 영문+숫자+특수문자를 포함해야 합니다.')
      return
    }
    if (newPassword !== confirm) {
      setError('새 비밀번호와 확인 값이 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    try {
      await setInitialPassword(newPassword, confirm)
      completeInitialPassword()
      // role은 최초 비밀번호 설정으로 바뀌지 않으므로, 부트스트랩 SUPER_ADMIN 계정이
      // ADMIN 전용 화면(/)으로 튕겨나가지 않도록 role에 맞는 목적지로 보낸다.
      navigate(user?.role === 'SUPER_ADMIN' ? '/organizations' : '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '비밀번호 설정에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="login-hero-brand">출동메이트</div>
        <div className="login-hero-title">최초 접속 확인</div>
        <div className="login-hero-footer">보안을 위해 최초 비밀번호를 변경해야 합니다</div>
      </div>
      <div className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form-title">최초 접속 비밀번호 설정</div>
          <div>
            <label className="field-label" htmlFor="newPassword">
              새 비밀번호 (8자 이상, 영문+숫자+특수문자)
            </label>
            <input
              id="newPassword"
              type="password"
              className="wf-field"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="confirmPassword">
              새 비밀번호 확인
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="wf-field"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="wf-btn primary login-submit" disabled={submitting}>
            {submitting ? '설정 중…' : '설정 완료'}
          </button>
          {error && <Banner kind="error" message={error} />}
        </form>
      </div>
    </div>
  )
}

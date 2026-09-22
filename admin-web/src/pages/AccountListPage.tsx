import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { Banner } from '../components/Banner'
import { ApiError } from '../api/client'
import { deactivateAccount, listAccounts, reissuePassword } from '../api/accounts'
import type { Role } from '../types'

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: '슈퍼관리자',
  ADMIN: '관리자',
  COMMANDER: '지휘관',
  RESPONDER: '대원',
}

// ADM-002 대원 계정 목록 (FR-10, NFR-05)
// QA 재검증 대상: 검색·필터가 실제 API 쿼리 파라미터로 나가는지가 핵심이므로, keyword/role을
// 그대로 useQuery의 queryKey에 넣어 값이 바뀔 때마다 반드시 새 요청이 나가도록 한다.
const PAGE_SIZE = 50

export function AccountListPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [role, setRole] = useState('ALL')
  const [page, setPage] = useState(0)
  const [deactivateTargetId, setDeactivateTargetId] = useState<string | null>(null)
  const [reissuedPassword, setReissuedPassword] = useState<{ name: string; password: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['accounts', keyword, role, page],
    queryFn: () => listAccounts({ keyword, role, page, size: PAGE_SIZE }),
  })

  // 계정이 50명을 넘으면 뒤쪽 계정이 목록에서 아예 안 보이던 결함 — 검색/필터를 바꾸면
  // 이전 페이지 번호가 그대로 남아 빈 결과처럼 보이는 걸 막기 위해 1페이지로 되돌린다.
  function updateKeyword(value: string) {
    setKeyword(value)
    setPage(0)
  }

  function updateRole(value: string) {
    setRole(value)
    setPage(0)
  }

  const reissueMutation = useMutation({
    mutationFn: (userId: string) => reissuePassword(userId),
    onSuccess: (result) => {
      setActionError(null)
      setReissuedPassword({ name: result.account.name, password: result.issuedTemporaryPassword })
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : '비밀번호 재발급에 실패했습니다.'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => deactivateAccount(userId),
    onSuccess: () => {
      setActionError(null)
      setDeactivateTargetId(null)
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : '비활성화에 실패했습니다.')
      setDeactivateTargetId(null)
    },
  })

  return (
    <AdminLayout screenId="ADM-002" title="대원 계정 관리">
      <div className="wf">
        <div className="wf-header">
          <span>대원 계정 관리</span>
          <Link to="/accounts/new" className="wf-btn primary small">
            + 계정 신규 등록
          </Link>
        </div>
        <div className="wf-body">
          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label className="field-label" htmlFor="keyword">
                검색
              </label>
              <input
                id="keyword"
                className="wf-field"
                placeholder="이름·사번·소속 검색"
                value={keyword}
                onChange={(e) => updateKeyword(e.target.value)}
              />
            </div>
            <div style={{ width: 160 }}>
              <label className="field-label" htmlFor="role">
                필터
              </label>
              <select id="role" className="wf-field" value={role} onChange={(e) => updateRole(e.target.value)}>
                <option value="ALL">역할 구분 전체</option>
                <option value="ADMIN">관리자</option>
                <option value="COMMANDER">지휘관</option>
                <option value="RESPONDER">대원</option>
              </select>
            </div>
          </div>

          {reissuedPassword && (
            <div className="wf-box" style={{ marginBottom: 12, borderColor: 'var(--color-success)' }}>
              <span className="label">{reissuedPassword.name}의 임시 비밀번호 재발급 (최초 1회만 표시)</span>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>{reissuedPassword.password}</strong>
            </div>
          )}
          {actionError && <Banner kind="error" message={actionError} />}

          {query.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {query.isError && <div className="banner error">계정 목록을 불러오지 못했습니다.</div>}

          {query.data && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>역할</th>
                  <th>소속</th>
                  <th>사번</th>
                  <th>연락처</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {query.data.content.map((account) => (
                  <tr key={account.userId}>
                    <td>{account.name}</td>
                    <td>{ROLE_LABEL[account.role]}</td>
                    <td>{account.team ?? '—'}</td>
                    <td>{account.badgeNumber}</td>
                    <td>{account.phone ?? '—'}</td>
                    <td>
                      <span className={`tag ${account.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}`}>
                        {account.status === 'ACTIVE' ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <Link to={`/accounts/${account.userId}/edit`} className="wf-btn small">
                        수정
                      </Link>
                      {account.status === 'ACTIVE' && (
                        <>
                          <button
                            type="button"
                            className="wf-btn small"
                            disabled={reissueMutation.isPending}
                            onClick={() => reissueMutation.mutate(account.userId)}
                          >
                            비밀번호 재발급
                          </button>
                          {deactivateTargetId === account.userId ? (
                            <>
                              <button
                                type="button"
                                className="wf-btn primary small"
                                disabled={deactivateMutation.isPending}
                                onClick={() => deactivateMutation.mutate(account.userId)}
                              >
                                {deactivateMutation.isPending ? '처리 중…' : '비활성화 확인'}
                              </button>
                              <button type="button" className="wf-btn small" onClick={() => setDeactivateTargetId(null)}>
                                취소
                              </button>
                            </>
                          ) : (
                            <button type="button" className="wf-btn small" onClick={() => setDeactivateTargetId(account.userId)}>
                              비활성화
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {query.data.content.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center' }}>
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {query.data && query.data.totalElements > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <span className="alert-meta">
                전체 {query.data.totalElements}명 · {query.data.number + 1} / {query.data.totalPages} 페이지
              </span>
              <button
                type="button"
                className="wf-btn small"
                disabled={query.data.first}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </button>
              <button
                type="button"
                className="wf-btn small"
                disabled={query.data.last}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

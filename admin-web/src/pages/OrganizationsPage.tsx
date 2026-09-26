import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState, type FormEvent } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { Banner } from '../components/Banner'
import { ApiError } from '../api/client'
import {
  createOrganization,
  issueFirstAdmin,
  listOrganizations,
  type OrganizationAdminAccountInput,
  type OrganizationCreateInput,
} from '../api/organizations'
import type { OrganizationResponse } from '../types'

const TYPE_LABEL: Record<string, string> = { PUBLIC: '공설소방서', CORPORATE: '자체소방대' }

const EMPTY_CREATE_FORM: OrganizationCreateInput = { code: '', name: '', type: 'PUBLIC' }
const EMPTY_ADMIN_FORM: OrganizationAdminAccountInput = { name: '', badgeNumber: '', team: '', phone: '' }

// 조직 온보딩(6번): 슈퍼관리자가 새 조직을 만들고 그 조직의 첫 ADMIN 계정을 발급하는 화면.
// AccountListPage/AccountFormPage와 같은 wf-* 패턴을 재사용한다 — issuedPassword는 발급
// 직후 1회만 보여주고 다시 조회할 방법이 없다는 원칙도 동일하게 지킨다.
export function OrganizationsPage() {
  const queryClient = useQueryClient()
  const [createForm, setCreateForm] = useState<OrganizationCreateInput>(EMPTY_CREATE_FORM)
  const [createError, setCreateError] = useState<string | null>(null)

  const [adminFormTargetId, setAdminFormTargetId] = useState<string | null>(null)
  const [adminForm, setAdminForm] = useState<OrganizationAdminAccountInput>(EMPTY_ADMIN_FORM)
  const [issuedAdmin, setIssuedAdmin] = useState<{ organizationName: string; password: string } | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)

  const query = useQuery({ queryKey: ['organizations'], queryFn: listOrganizations })

  const createMutation = useMutation({
    mutationFn: (input: OrganizationCreateInput) => createOrganization(input),
    onSuccess: () => {
      setCreateError(null)
      setCreateForm(EMPTY_CREATE_FORM)
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : '조직 등록에 실패했습니다.'),
  })

  const issueMutation = useMutation({
    mutationFn: ({ organization }: { organization: OrganizationResponse }) =>
      issueFirstAdmin(organization.organizationId, adminForm),
    onSuccess: (result, variables) => {
      setIssueError(null)
      setAdminFormTargetId(null)
      setAdminForm(EMPTY_ADMIN_FORM)
      setIssuedAdmin({ organizationName: variables.organization.name, password: result.issuedTemporaryPassword })
    },
    onError: (err) => setIssueError(err instanceof ApiError ? err.message : '관리자 계정 발급에 실패했습니다.'),
  })

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault()
    setCreateError(null)
    createMutation.mutate(createForm)
  }

  function openAdminForm(organizationId: string) {
    setIssueError(null)
    setAdminForm(EMPTY_ADMIN_FORM)
    setAdminFormTargetId(organizationId)
  }

  function handleAdminFormSubmit(e: FormEvent, organization: OrganizationResponse) {
    e.preventDefault()
    setIssueError(null)
    issueMutation.mutate({ organization })
  }

  return (
    <AdminLayout screenId="SUPER-001" title="조직 관리">
      <div className="wf" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="wf-header">
          <span>새 조직 등록</span>
        </div>
        <form className="wf-body" onSubmit={handleCreateSubmit}>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="orgCode">
                조직 코드
              </label>
              <input
                id="orgCode"
                className="wf-field"
                placeholder="예: SAMSUNG-ULSAN"
                value={createForm.code}
                onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="orgName">
                조직명
              </label>
              <input
                id="orgName"
                className="wf-field"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="orgType">
                조직 유형
              </label>
              <select
                id="orgType"
                className="wf-field"
                value={createForm.type}
                onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value as OrganizationCreateInput['type'] }))}
              >
                <option value="PUBLIC">공설소방서</option>
                <option value="CORPORATE">자체소방대</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="wf-btn primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? '등록 중…' : '조직 등록'}
            </button>
          </div>
          {createError && <Banner kind="error" message={createError} />}
        </form>
      </div>

      {issuedAdmin && (
        <div className="wf-box" style={{ marginBottom: 12, borderColor: 'var(--color-success)' }}>
          <span className="label">{issuedAdmin.organizationName}의 첫 ADMIN 임시 비밀번호 (최초 1회만 표시)</span>
          <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>{issuedAdmin.password}</strong>
        </div>
      )}
      {issueError && <Banner kind="error" message={issueError} />}

      <div className="wf">
        <div className="wf-header">
          <span>조직 목록</span>
        </div>
        <div className="wf-body">
          {query.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {query.isError && <div className="banner error">조직 목록을 불러오지 못했습니다.</div>}

          {query.data && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>조직 코드</th>
                  <th>조직명</th>
                  <th>유형</th>
                  <th>상태</th>
                  <th>등록일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((organization) => (
                  <Fragment key={organization.organizationId}>
                    <tr>
                      <td>{organization.code}</td>
                      <td>{organization.name}</td>
                      <td>{TYPE_LABEL[organization.type] ?? organization.type}</td>
                      <td>{organization.status}</td>
                      <td>{new Date(organization.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button
                          type="button"
                          className="wf-btn small"
                          onClick={() =>
                            adminFormTargetId === organization.organizationId
                              ? setAdminFormTargetId(null)
                              : openAdminForm(organization.organizationId)
                          }
                        >
                          첫 ADMIN 계정 발급
                        </button>
                      </td>
                    </tr>
                    {adminFormTargetId === organization.organizationId && (
                      <tr>
                        <td colSpan={6}>
                          <form
                            className="form-row"
                            style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
                            onSubmit={(e) => handleAdminFormSubmit(e, organization)}
                          >
                            <div>
                              <label className="field-label" htmlFor="adminName">
                                이름
                              </label>
                              <input
                                id="adminName"
                                className="wf-field"
                                value={adminForm.name}
                                onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
                                required
                              />
                            </div>
                            <div>
                              <label className="field-label" htmlFor="adminBadgeNumber">
                                사번
                              </label>
                              <input
                                id="adminBadgeNumber"
                                className="wf-field"
                                value={adminForm.badgeNumber}
                                onChange={(e) => setAdminForm((f) => ({ ...f, badgeNumber: e.target.value }))}
                                required
                              />
                            </div>
                            <div>
                              <label className="field-label" htmlFor="adminTeam">
                                소속
                              </label>
                              <input
                                id="adminTeam"
                                className="wf-field"
                                value={adminForm.team}
                                onChange={(e) => setAdminForm((f) => ({ ...f, team: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="field-label" htmlFor="adminPhone">
                                연락처
                              </label>
                              <input
                                id="adminPhone"
                                className="wf-field"
                                value={adminForm.phone}
                                onChange={(e) => setAdminForm((f) => ({ ...f, phone: e.target.value }))}
                              />
                            </div>
                            <button type="submit" className="wf-btn primary small" disabled={issueMutation.isPending}>
                              {issueMutation.isPending ? '발급 중…' : '발급'}
                            </button>
                            <button type="button" className="wf-btn small" onClick={() => setAdminFormTargetId(null)}>
                              취소
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {query.data.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center' }}>
                      등록된 조직이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

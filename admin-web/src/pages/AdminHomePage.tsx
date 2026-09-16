import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { Banner } from '../components/Banner'
import { StatCard } from '../components/StatCard'
import { getDashboardSummary, listRecentIncidents } from '../api/incidentsDashboard'
import { confirmIncident, listAiSuspectedQueue, rejectIncident } from '../api/incidents'
import { ApiError } from '../api/client'

const INCIDENT_TYPE_LABEL: Record<string, string> = { FIRE: '화재', RESCUE: '구조', EMERGENCY: '응급' }
const STATUS_LABEL: Record<string, string> = {
  AI_SUSPECTED: 'AI 의심감지',
  DISPATCHED: '출동중',
  IN_PROGRESS: '진행중',
  CLOSED: '종료',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ADM-001 관리자 홈 (FR-09, FR-24)
export function AdminHomePage() {
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)

  const summaryQuery = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary })
  const queueQuery = useQuery({ queryKey: ['ai-suspected-queue'], queryFn: listAiSuspectedQueue })
  const recentQuery = useQuery({ queryKey: ['recent-incidents'], queryFn: () => listRecentIncidents(0, 5) })

  function invalidateAfterDecision() {
    queryClient.invalidateQueries({ queryKey: ['ai-suspected-queue'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    queryClient.invalidateQueries({ queryKey: ['recent-incidents'] })
  }

  const confirmMutation = useMutation({
    mutationFn: confirmIncident,
    onSuccess: invalidateAfterDecision,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : '확정 처리에 실패했습니다.'),
  })
  const rejectMutation = useMutation({
    mutationFn: rejectIncident,
    onSuccess: invalidateAfterDecision,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : '오탐 처리에 실패했습니다.'),
  })

  const summary = summaryQuery.data

  return (
    <AdminLayout screenId="ADM-001" title="관리자 홈">
      {actionError && <Banner kind="error" message={actionError} />}

      <div className="stat-grid">
        <StatCard value={summary ? `${summary.todayDispatchCount}건` : '—'} label="금일 출동" />
        <StatCard value={summary ? `${summary.inProgressCount}건` : '—'} label="진행중 출동" />
        <StatCard value={summary ? summary.onDutyResponderCount : '—'} label="근무 대원" />
        <StatCard value={summary ? summary.deviceAnomalyCount : '—'} label="기기 이상" alert={!!summary?.deviceAnomalyCount} />
      </div>

      <div className="wf" style={{ marginBottom: 14, borderColor: 'var(--color-alert)' }}>
        <div className="wf-header alert">
          <span>⚠ AI 의심감지 대기열 (FR-24) · 확인 필요 {queueQuery.data?.length ?? 0}건</span>
        </div>
        <div className="wf-body">
          {queueQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {queueQuery.data && queueQuery.data.length === 0 && (
            <div className="spinner-text">확인이 필요한 AI 의심감지가 없습니다.</div>
          )}
          {queueQuery.data && queueQuery.data.length > 0 && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>스냅샷</th>
                  <th>감지시각</th>
                  <th>위치</th>
                  <th>신뢰도</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {queueQuery.data.map((item) => (
                  <tr key={item.incidentId}>
                    <td>
                      {item.snapshotBase64 ? (
                        <img
                          src={`data:image/jpeg;base64,${item.snapshotBase64}`}
                          alt="감지 스냅샷"
                          style={{ width: 96, height: 54, objectFit: 'cover', border: '1px solid var(--color-line)' }}
                        />
                      ) : (
                        <span className="alert-meta">스냅샷 없음</span>
                      )}
                    </td>
                    <td>{formatDateTime(item.detectedAt)}</td>
                    <td>{item.address ?? '—'}</td>
                    <td>{item.confidenceScore != null ? `${Math.round(item.confidenceScore)}%` : '—'}</td>
                    <td style={{ color: 'var(--color-alert)' }}>{STATUS_LABEL[item.status]}</td>
                    <td>
                      <button
                        type="button"
                        className="wf-btn primary small"
                        disabled={confirmMutation.isPending || rejectMutation.isPending}
                        onClick={() => confirmMutation.mutate(item.incidentId)}
                      >
                        확인·출동
                      </button>{' '}
                      <button
                        type="button"
                        className="wf-btn small"
                        disabled={confirmMutation.isPending || rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate(item.incidentId)}
                      >
                        오탐 처리
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="wf" style={{ marginBottom: 14 }}>
        <div className="wf-header">
          <span>최근 출동 목록</span>
        </div>
        <div className="wf-body">
          {recentQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {recentQuery.data && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>출동번호</th>
                  <th>유형</th>
                  <th>상태</th>
                  <th>배정 대원</th>
                </tr>
              </thead>
              <tbody>
                {recentQuery.data.content.map((incident) => (
                  <tr key={incident.incidentId}>
                    <td>{incident.incidentNumber}</td>
                    <td>{INCIDENT_TYPE_LABEL[incident.incidentType] ?? incident.incidentType}</td>
                    <td style={{ color: incident.status === 'CLOSED' ? undefined : 'var(--color-alert)' }}>
                      {STATUS_LABEL[incident.status]}
                    </td>
                    <td>{incident.assignedResponderCount}명</td>
                  </tr>
                ))}
                {recentQuery.data.content.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center' }}>
                      출동 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <Link to="/accounts/new" className="wf-btn">
          계정 등록
        </Link>
        <Link to="/devices" className="wf-btn">
          기기 매핑
        </Link>
        <Link to="/statistics" className="wf-btn">
          통계 보기
        </Link>
        <Link to="/accounts" className="wf-btn">
          전체 계정
        </Link>
      </div>
    </AdminLayout>
  )
}

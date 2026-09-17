import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { acknowledgeAlert, getAckFreshness, listAlerts, postRiskWarning } from '../api/alerts'
import { ApiError } from '../api/client'
import { Banner } from '../components/Banner'
import type { AlertResponse, AssignmentResponse } from '../types'

const ALERT_TYPE_LABEL: Record<string, string> = {
  RISK_WARNING: '⚠ 위험정보',
  EVACUATION: '🚨 대피지시',
  STATUS_CHANGE: '상태변경',
  ENTRY_INFO: '진입정보',
  SUPPLY_REQUEST: '지원요청',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function describeAlert(alert: AlertResponse): string {
  if (alert.alertType === 'ENTRY_INFO') {
    return `[${alert.locationLabel ?? '-'}] ${alert.statusTag ?? ''} ${alert.message ?? ''}`.trim()
  }
  if (alert.alertType === 'SUPPLY_REQUEST') {
    return (alert.requestedItems ?? []).map((i) => `${i.item} x${i.qty}`).join(', ') || '요청 항목 없음'
  }
  return alert.message ?? '(내용 없음)'
}

function AckFreshness({ alertId }: { alertId: string }) {
  const freshnessQuery = useQuery({ queryKey: ['ack-freshness', alertId], queryFn: () => getAckFreshness(alertId) })
  if (!freshnessQuery.data) return null
  const { acknowledgedUserIds, lastAcknowledgedAt, isStale } = freshnessQuery.data
  return (
    <span className="alert-meta" style={isStale ? { color: 'var(--color-alert)' } : undefined}>
      {' '}
      · 확인 {acknowledgedUserIds.length}명
      {lastAcknowledgedAt
        ? ` · 최근 ${formatTime(lastAcknowledgedAt)}${isStale ? ' (갱신 필요)' : ''}`
        : ' · 확인자 없음 (갱신 필요)'}
    </span>
  )
}

// CMD-002 알림 피드 + FR-06 위험정보 알림 발신. FR-18/FR-23은 USR-001(대원 앱)이 입력하고
// 이 화면은 수신·확인현황(FR-22)만 표시한다.
export function AlertsPanel({ incidentId, assignments }: { incidentId: string; assignments: AssignmentResponse[] }) {
  const queryClient = useQueryClient()
  const [targetUserId, setTargetUserId] = useState('')
  const [channel, setChannel] = useState<'VOICE' | 'TEXT'>('TEXT')
  const [message, setMessage] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const alertsQuery = useQuery({ queryKey: ['alerts', incidentId], queryFn: () => listAlerts(incidentId) })

  const sendWarningMutation = useMutation({
    mutationFn: () => postRiskWarning(incidentId, { targetUserId: targetUserId || undefined, channel, message }),
    onSuccess: () => {
      setMessage('')
      setFeedback({ kind: 'success', text: '위험정보를 발송했습니다.' })
      queryClient.invalidateQueries({ queryKey: ['alerts', incidentId] })
    },
    onError: (err) => setFeedback({ kind: 'error', text: err instanceof ApiError ? err.message : '발송에 실패했습니다.' }),
  })

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeAlert(alertId),
    onSuccess: (_data, alertId) => queryClient.invalidateQueries({ queryKey: ['ack-freshness', alertId] }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFeedback(null)
    if (!message.trim()) {
      setFeedback({ kind: 'error', text: '전달할 내용을 입력하세요.' })
      return
    }
    sendWarningMutation.mutate()
  }

  const alerts = alertsQuery.data ?? []

  return (
    <div className="wf" style={{ marginBottom: 14 }}>
      <div className="wf-header">
        <span>알림·인수인계 피드 (FR-06, FR-18, FR-22, FR-23)</span>
      </div>
      <div className="wf-body">
        <form onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <div className="form-row">
            <select
              className="wf-field"
              aria-label="발송 대상"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
            >
              <option value="">전체 대원 브로드캐스트</option>
              {assignments.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.userId.slice(0, 8)} 개별 발송
                </option>
              ))}
            </select>
            <select
              className="wf-field"
              aria-label="발송 채널"
              value={channel}
              onChange={(e) => setChannel(e.target.value as 'VOICE' | 'TEXT')}
            >
              <option value="TEXT">문자</option>
              <option value="VOICE">음성</option>
            </select>
          </div>
          <div className="form-row">
            <input
              className="wf-field"
              aria-label="위험정보 내용"
              placeholder="위험정보 내용 (예: 2층 붕괴 위험, 즉시 대피)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button type="submit" className="wf-btn primary" disabled={sendWarningMutation.isPending}>
              {sendWarningMutation.isPending ? '발송 중…' : '위험정보 발송'}
            </button>
          </div>
          {feedback && <Banner kind={feedback.kind} message={feedback.text} />}
        </form>

        {/* 실시간 알림 피드 — 새 알림이 도착하면 스크린 리더 사용자에게도 낭독되도록 aria-live로 감싼다. */}
        <div aria-live="polite">
          {alertsQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {alerts.length === 0 && !alertsQuery.isLoading && <div className="spinner-text">아직 알림이 없습니다.</div>}
          {alerts.map((alert) => (
            <div key={alert.alertId} className="alert-item">
              <div>
                <strong>{ALERT_TYPE_LABEL[alert.alertType ?? ''] ?? alert.alertType}</strong> {describeAlert(alert)}
              </div>
              <div className="alert-meta">
                {formatTime(alert.sentAt)} · {alert.sourceType}
                <AckFreshness alertId={alert.alertId} />
                {' · '}
                <button
                  type="button"
                  className="wf-btn small"
                  disabled={ackMutation.isPending}
                  onClick={() => ackMutation.mutate(alert.alertId)}
                >
                  확인했어요
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

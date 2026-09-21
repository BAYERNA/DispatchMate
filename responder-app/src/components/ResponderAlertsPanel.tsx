import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect, useState, type FormEvent } from 'react'
import { AuthContext } from '../auth/AuthContext'
import { acknowledgeAlert, getAckFreshness, listAlerts, postEntryInfo, postRiskWarning, postSupplyRequest } from '../api/alerts'
import { ApiError } from '../api/client'
import { Banner } from './Banner'
import type { AlertResponse } from '../types'
import { receiveAlerts } from '../api/receipts'

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
  const auth = useContext(AuthContext)
  const freshnessQuery = useQuery({ queryKey: ['ack-freshness', alertId], queryFn: () => getAckFreshness(alertId), refetchInterval: 10000 })
  if (!freshnessQuery.data) return null
  const { acknowledgedUserIds, lastAcknowledgedAt, isStale } = freshnessQuery.data
  return (
    <span className="alert-meta" style={isStale ? { color: 'var(--color-alert)' } : undefined}>
      {' '}
      · 확인 {acknowledgedUserIds.length}명{lastAcknowledgedAt ? ` · 최근 ${formatTime(lastAcknowledgedAt)}` : ''}
      {auth?.user && (acknowledgedUserIds.includes(auth.user.userId) ? ' · 내 확인 완료' : ' · 내 확인 대기')}
    </span>
  )
}

// USR-001 알림·인수인계: FR-18(진입정보, 통신담당만 발신) / FR-23(지원요청) / FR-06(위험정보) / FR-22(확인).
export function ResponderAlertsPanel({ incidentId, isCommsLead }: { incidentId: string; isCommsLead: boolean }) {
  const queryClient = useQueryClient()
  // isCommsLead는 monitoring 조회가 끝난 뒤 비동기로 확정되므로, useState 초기값이 아니라
  // useEffect로 맞춰야 마운트 시점의 false 값에 기본 탭이 고정되는 문제를 피할 수 있다.
  const [mode, setMode] = useState<'entry' | 'supply' | 'warning'>('supply')
  const [modeTouched, setModeTouched] = useState(false)

  useEffect(() => {
    if (!modeTouched && isCommsLead) setMode('entry')
  }, [isCommsLead, modeTouched])

  function selectMode(next: 'entry' | 'supply' | 'warning') {
    setModeTouched(true)
    setMode(next)
  }
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [locationLabel, setLocationLabel] = useState('')
  const [statusTag, setStatusTag] = useState<'PASSABLE' | 'BLOCKED' | 'DANGER'>('PASSABLE')
  const [infoCategory, setInfoCategory] = useState<'ENTRY' | 'HAZARD'>('ENTRY')
  const [entryMessage, setEntryMessage] = useState('')

  const [items, setItems] = useState('')

  const [warningMessage, setWarningMessage] = useState('')

  const alertsQuery = useQuery({ queryKey: ['alerts', incidentId], queryFn: () => listAlerts(incidentId), refetchInterval: 10000 })
  const receiptQuery = useQuery({
    queryKey: ['alert-receipts', incidentId, alertsQuery.dataUpdatedAt],
    queryFn: () => receiveAlerts(incidentId, (alertsQuery.data ?? []).map(alert => alert.alertId)),
    enabled: Boolean(alertsQuery.data?.length) && !alertsQuery.isError,
    retry: 2,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['alerts', incidentId] })

  const entryMutation = useMutation({
    mutationFn: () => postEntryInfo(incidentId, { infoCategory, locationLabel, statusTag, message: entryMessage || undefined }),
    onSuccess: (result) => {
      setSuccess(result.queued ? '오프라인 보관했습니다. 연결되면 공유합니다.' : '진입정보를 공유했습니다.')
      setError(null)
      setLocationLabel('')
      setEntryMessage('')
      invalidate()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '진입정보 공유에 실패했습니다.'),
  })

  const supplyMutation = useMutation({
    mutationFn: () => {
      const requestedItems = items
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const [item, qty] = entry.split(':').map((s) => s.trim())
          return { item, qty: Number(qty) || 1 }
        })
      return postSupplyRequest(incidentId, requestedItems)
    },
    onSuccess: (result) => {
      setSuccess(result.queued ? '오프라인 보관했습니다. 연결되면 요청합니다.' : '지원요청을 보냈습니다.')
      setError(null)
      setItems('')
      invalidate()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '지원요청에 실패했습니다.'),
  })

  const warningMutation = useMutation({
    mutationFn: () => postRiskWarning(incidentId, { channel: 'TEXT', message: warningMessage }),
    onSuccess: (result) => {
      setSuccess(result.queued ? '오프라인 보관했습니다. 연결 즉시 발송합니다.' : '위험정보를 발송했습니다.')
      setError(null)
      setWarningMessage('')
      invalidate()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '위험정보 발송에 실패했습니다.'),
  })

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeAlert(alertId),
    onSuccess: (result, alertId) => { if(result.queued)setSuccess('확인을 오프라인 보관했습니다. 연결되면 전송합니다.'); else queryClient.invalidateQueries({ queryKey: ['ack-freshness', alertId] }) },
    onError: () => setError('확인이 저장되지 않았습니다. 연결 후 다시 눌러주세요.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSuccess(null)
    setError(null)
    if (mode === 'entry') {
      if (!locationLabel.trim()) {
        setError('위치를 입력하세요.')
        return
      }
      entryMutation.mutate()
    } else if (mode === 'supply') {
      if (!items.trim()) {
        setError('요청 항목을 입력하세요 (예: 공기호흡기:2, 인력:3).')
        return
      }
      supplyMutation.mutate()
    } else {
      if (!warningMessage.trim()) {
        setError('위험정보 내용을 입력하세요.')
        return
      }
      warningMutation.mutate()
    }
  }

  const alerts = alertsQuery.data ?? []
  const pending = entryMutation.isPending || supplyMutation.isPending || warningMutation.isPending

  return (
    <div className="wf" style={{ marginBottom: 14 }}>
      <div className="wf-header">
        <span>알림·인수인계 (FR-06, FR-18, FR-22, FR-23)</span>
      </div>
      <div className="wf-body">
        <div className="alert-mode-tabs">
          {isCommsLead && (
            <button type="button" className={`wf-btn small${mode === 'entry' ? ' primary' : ''}`} onClick={() => selectMode('entry')}>
              진입정보
            </button>
          )}
          <button type="button" className={`wf-btn small${mode === 'supply' ? ' primary' : ''}`} onClick={() => selectMode('supply')}>
            지원요청
          </button>
          <button type="button" className={`wf-btn small${mode === 'warning' ? ' primary' : ''}`} onClick={() => selectMode('warning')}>
            위험정보
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          {mode === 'entry' && isCommsLead && (
            <>
              <div className="form-row">
                <select
                  className="wf-field"
                  aria-label="정보 구분"
                  value={infoCategory}
                  onChange={(e) => setInfoCategory(e.target.value as 'ENTRY' | 'HAZARD')}
                >
                  <option value="ENTRY">진입 정보</option>
                  <option value="HAZARD">위험 요인</option>
                </select>
                <select
                  className="wf-field"
                  aria-label="통행 상태"
                  value={statusTag}
                  onChange={(e) => setStatusTag(e.target.value as typeof statusTag)}
                >
                  <option value="PASSABLE">통과가능</option>
                  <option value="BLOCKED">막힘</option>
                  <option value="DANGER">위험</option>
                </select>
              </div>
              <div className="form-row">
                <input
                  className="wf-field"
                  aria-label="위치"
                  placeholder="위치 (예: 2층 복도)"
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                />
              </div>
              <div className="form-row">
                <input
                  className="wf-field"
                  aria-label="추가 설명"
                  placeholder="추가 설명 (선택)"
                  value={entryMessage}
                  onChange={(e) => setEntryMessage(e.target.value)}
                />
                <button type="submit" className="wf-btn primary" disabled={pending}>
                  공유
                </button>
              </div>
            </>
          )}

          {mode === 'supply' && (
            <div className="form-row">
              <input
                className="wf-field"
                aria-label="지원요청 항목"
                placeholder="예: 공기호흡기:2, 인력:3"
                value={items}
                onChange={(e) => setItems(e.target.value)}
              />
              <button type="submit" className="wf-btn primary" disabled={pending}>
                요청
              </button>
            </div>
          )}

          {mode === 'warning' && (
            <div className="form-row">
              <input
                className="wf-field"
                aria-label="위험정보 내용"
                placeholder="예: 2층 붕괴 위험, 즉시 대피"
                value={warningMessage}
                onChange={(e) => setWarningMessage(e.target.value)}
              />
              <button type="submit" className="wf-btn primary" disabled={pending}>
                발송
              </button>
            </div>
          )}
          {success && <Banner kind="success" message={success} />}
          {error && <Banner kind="error" message={error} />}
        </form>

        {/* 실시간 알림 피드 — 새 알림이 도착하면 스크린 리더 사용자에게도 낭독되도록 aria-live로 감싼다. */}
        <div aria-live="polite">
          {alertsQuery.isError && <Banner kind="error" message="알림 동기화 실패. 연결 후 자동으로 재시도합니다." />}
          {receiptQuery.isError && <Banner kind="error" message="앱 수신 기록 전송에 실패했습니다. 자동으로 재시도합니다." />}
          {alertsQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {alerts.length === 0 && !alertsQuery.isLoading && !alertsQuery.isError && <div className="spinner-text">아직 알림이 없습니다.</div>}
          {alerts.map((alert) => (
            <div key={alert.alertId} className="alert-item">
              <div>
                <strong>{ALERT_TYPE_LABEL[alert.alertType ?? ''] ?? alert.alertType}</strong> {describeAlert(alert)}
              </div>
              <div className="alert-meta">
                {formatTime(alert.sentAt)} · {alert.sourceType}
                <AckFreshness alertId={alert.alertId} />
                {' · '}
                <button type="button" className="wf-btn small" disabled={ackMutation.isPending} onClick={() => ackMutation.mutate(alert.alertId)}>
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

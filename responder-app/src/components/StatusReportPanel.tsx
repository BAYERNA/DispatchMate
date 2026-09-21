import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { recordResponderStatus } from '../api/incidents'
import { ApiError } from '../api/client'
import { Banner } from './Banner'

const RISK_OPTIONS = [
  { value: 'NORMAL', label: '정상' },
  { value: 'CAUTION', label: '주의' },
  { value: 'DANGER', label: '위험' },
] as const
const CONNECTION_OPTIONS = [
  { value: 'CONNECTED', label: '정상연결' },
  { value: 'MESH', label: '메시망' },
  { value: 'SMS', label: 'SMS' },
  { value: 'DISCONNECTED', label: '연결끊김' },
] as const

// FR-03/04/12: 대원 실시간 상태 보고. 실제 웨어러블 연동 전이라, 값을 임의로 만들어내는 대신
// 대원이 직접 입력해 보내는 수동 보고 형태로 둔다 — CMD-002/003이 이 값을 그대로 보여준다.
export function StatusReportPanel({ incidentId, userId }: { incidentId: string; userId: string }) {
  const queryClient = useQueryClient()
  const [heartRate, setHeartRate] = useState('')
  const [bodyTemperature, setBodyTemperature] = useState('')
  const [ambientTemperature, setAmbientTemperature] = useState('')
  const [gasLevel, setGasLevel] = useState('')
  const [riskLevel, setRiskLevel] = useState<'NORMAL' | 'CAUTION' | 'DANGER'>('NORMAL')
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'MESH' | 'SMS' | 'DISCONNECTED'>('CONNECTED')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      recordResponderStatus(incidentId, {
        userId,
        biometricData: {
          ...(heartRate ? { heartRate: Number(heartRate) } : {}),
          ...(bodyTemperature ? { bodyTemperature: Number(bodyTemperature) } : {}),
        },
        environmentData: {
          ...(ambientTemperature ? { ambientTemperature: Number(ambientTemperature) } : {}),
          ...(gasLevel ? { gasLevel: Number(gasLevel) } : {}),
        },
        riskLevel,
        connectionStatus,
      }),
    onSuccess: () => {
      setError(null)
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['monitoring', incidentId] })
    },
    onError: (err) => {
      setSuccess(false)
      setError(err instanceof ApiError ? err.message : '상태 보고에 실패했습니다.')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSuccess(false)
    mutation.mutate()
  }

  return (
    <div className="wf" style={{ marginBottom: 14 }}>
      <div className="wf-header">
        <span>내 상태 보고 (FR-03/04/12)</span>
      </div>
      <div className="wf-body">
        <form onSubmit={handleSubmit}>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div>
              <label className="field-label" htmlFor="heartRate">
                심박수 (bpm)
              </label>
              <input
                id="heartRate"
                type="number"
                className="wf-field"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="bodyTemperature">
                체온 (℃)
              </label>
              <input
                id="bodyTemperature"
                type="number"
                step="0.1"
                className="wf-field"
                value={bodyTemperature}
                onChange={(e) => setBodyTemperature(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="ambientTemperature">
                주변온도 (℃)
              </label>
              <input
                id="ambientTemperature"
                type="number"
                className="wf-field"
                value={ambientTemperature}
                onChange={(e) => setAmbientTemperature(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="gasLevel">
                가스농도
              </label>
              <input id="gasLevel" type="number" className="wf-field" value={gasLevel} onChange={(e) => setGasLevel(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <select className="wf-field" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as typeof riskLevel)}>
              {RISK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  위험도: {o.label}
                </option>
              ))}
            </select>
            <select
              className="wf-field"
              value={connectionStatus}
              onChange={(e) => setConnectionStatus(e.target.value as typeof connectionStatus)}
            >
              {CONNECTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  연결: {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="wf-btn primary" disabled={mutation.isPending}>
              {mutation.isPending ? '전송 중…' : '상태 전송'}
            </button>
          </div>
          {success && <Banner kind="success" message={mutation.data?.queued ? '오프라인 보관했습니다. 연결되면 자동 전송합니다.' : '상태를 전송했습니다.'} />}
          {error && <Banner kind="error" message={error} />}
        </form>
      </div>
    </div>
  )
}

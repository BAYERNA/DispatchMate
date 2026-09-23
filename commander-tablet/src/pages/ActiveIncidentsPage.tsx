import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TabletLayout } from '../components/TabletLayout'
import { getActiveIncidents, getGroundRouteEstimate, getPreAnalysis } from '../api/incidents'
import { ApiError } from '../api/client'
import './ActiveIncidentsPage.css'

const INCIDENT_TYPE_LABEL: Record<string, string> = { FIRE: '화재', RESCUE: '구조', EMERGENCY: '응급' }
const STATUS_LABEL: Record<string, string> = {
  AI_SUSPECTED: 'AI 의심감지',
  DISPATCHED: '출동중',
  IN_PROGRESS: '진행중',
  CLOSED: '종료',
}
const SOURCE_LABEL: Record<string, string> = { MANUAL_REPORT: '신고접수', CCTV_AUTO_DETECTION: 'CCTV 자동감지' }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatEta(etaSeconds: number): string {
  if (etaSeconds < 0) return '거리 정보 없음'
  const m = Math.round(etaSeconds / 60)
  return `약 ${m}분`
}

function InfoBox({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  const entries = data ? Object.entries(data) : []
  return (
    <div className="wf-box">
      <span className="label">{label}</span>
      {entries.length === 0 && <div>정보 없음</div>}
      {entries.map(([key, value]) => (
        <div key={key}>
          {key}: {String(value)}
        </div>
      ))}
    </div>
  )
}

// CMD-001 출동지령·사전분석 (FR-02). 지휘관 태블릿 진입 화면 — DISPATCHED/IN_PROGRESS 출동 목록에서
// 하나를 골라 사전분석 결과(NFR-03: 3초 이내 표시 목표)를 확인하고 현장 모니터링(CMD-002)으로 넘어간다.
export function ActiveIncidentsPage() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const incidentsQuery = useQuery({ queryKey: ['active-incidents'], queryFn: getActiveIncidents, refetchInterval: 15000 })
  const incidents = incidentsQuery.data ?? []
  const selected = incidents.find((i) => i.incidentId === selectedId) ?? incidents[0] ?? null

  const preAnalysisQuery = useQuery({
    queryKey: ['pre-analysis', selected?.incidentId],
    queryFn: () => getPreAnalysis(selected!.incidentId),
    enabled: !!selected,
    retry: false,
  })

  const routeEstimateQuery = useQuery({
    queryKey: ['route-estimate', selected?.incidentId],
    queryFn: () => getGroundRouteEstimate(selected!.incidentId),
    enabled: !!selected,
    retry: false,
  })

  return (
    <TabletLayout screenId="CMD-001" title="출동지령·사전분석">
      <div className="incidents-layout">
        <div>
          <div className="pre-analysis-section">
            <div className="section-title">진행중인 출동 ({incidents.length}건)</div>
          </div>
          {incidentsQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {incidents.length === 0 && !incidentsQuery.isLoading && (
            <div className="spinner-text">현재 배정된 출동이 없습니다.</div>
          )}
          {incidents.map((incident) => (
            <button
              key={incident.incidentId}
              type="button"
              className={`incident-list-item${selected?.incidentId === incident.incidentId ? ' selected' : ''}`}
              onClick={() => setSelectedId(incident.incidentId)}
            >
              <div className="incident-number">
                {incident.incidentNumber} · {SOURCE_LABEL[incident.source] ?? incident.source}
                {incident.droneDispatchSkipReason && (
                  <span className="tag risk-danger" style={{ marginLeft: 6 }}>
                    드론 미배정
                  </span>
                )}
              </div>
              <div className="incident-address">{incident.address ?? '주소 정보 없음'}</div>
              <div className="incident-number">{formatDateTime(incident.reportedAt)}</div>
            </button>
          ))}
        </div>

        <div>
          {!selected && <div className="spinner-text">좌측에서 출동을 선택하세요.</div>}
          {selected && (
            <>
              <div className="wf" style={{ marginBottom: 14, borderColor: 'var(--color-alert)' }}>
                <div className="wf-header alert">
                  <span>
                    {selected.incidentNumber} · {INCIDENT_TYPE_LABEL[selected.incidentType] ?? selected.incidentType} ·{' '}
                    {STATUS_LABEL[selected.status]}
                  </span>
                  <span>{formatDateTime(selected.reportedAt)} 접수</span>
                </div>
                <div className="wf-body">
                  <div style={{ marginBottom: 10 }}>주소: {selected.address ?? '—'}</div>

                  <div className="pre-analysis-section">
                    <div className="section-title">후발대 경로·ETA (FR-20, 소방서 고정좌표 근사)</div>
                    {routeEstimateQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
                    {routeEstimateQuery.isError && <div className="spinner-text">아직 경로 정보가 없습니다.</div>}
                    {routeEstimateQuery.data && (
                      <div className="wf-box">
                        <span className="label">{routeEstimateQuery.data.originLabel ?? '출발지 미상'} → 현장</span>
                        <div>
                          {formatEta(routeEstimateQuery.data.etaSeconds)}
                          {routeEstimateQuery.data.distanceKm != null && ` · ${routeEstimateQuery.data.distanceKm}km`}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pre-analysis-section">
                    <div className="section-title">
                      사전분석 결과
                      {preAnalysisQuery.data && ` (${(preAnalysisQuery.data.elapsedMillis / 1000).toFixed(1)}초)`}
                    </div>
                    {preAnalysisQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
                    {preAnalysisQuery.isError && (
                      <div className="spinner-text">
                        {preAnalysisQuery.error instanceof ApiError
                          ? preAnalysisQuery.error.message
                          : '사전분석 결과를 아직 사용할 수 없습니다.'}
                      </div>
                    )}
                    {preAnalysisQuery.data && (
                      <div className="pre-analysis-grid">
                        <InfoBox label="건물정보" data={preAnalysisQuery.data.buildingInfo} />
                        <InfoBox label="위험요인" data={preAnalysisQuery.data.hazardInfo} />
                        <InfoBox label="화재이력" data={preAnalysisQuery.data.fireHistoryInfo} />
                        <div className="wf-box">
                          <span className="label">데이터 출처</span>
                          <div>{preAnalysisQuery.data.dataSource ?? '—'}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="wf-btn primary"
                      onClick={() => navigate(`/incidents/${selected.incidentId}`)}
                    >
                      현장 모니터링 시작 →
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </TabletLayout>
  )
}

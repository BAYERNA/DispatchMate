import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MobileLayout } from '../components/MobileLayout'
import { StatusReportPanel } from '../components/StatusReportPanel'
import { ResponderAlertsPanel } from '../components/ResponderAlertsPanel'
import { useAuth } from '../auth/useAuth'
import { getMonitoring, getMyActiveIncidents } from '../api/incidents'
import { useIncidentSocket } from '../ws/useIncidentSocket'
import './ResponderHomePage.css'
import { OfflineOutboxStatus } from '../components/OfflineOutboxStatus'
import { FieldMissionPanel } from '../components/FieldMissionPanel'
import { EmergencyOperationsPanel } from '../components/EmergencyOperationsPanel'
import { PushEnableButton } from '../components/PushEnableButton'
import { SecureEvidenceCapture } from '../components/SecureEvidenceCapture'

const INCIDENT_TYPE_LABEL: Record<string, string> = { FIRE: '화재', RESCUE: '구조', EMERGENCY: '응급' }
const STATUS_LABEL: Record<string, string> = { AI_SUSPECTED: 'AI 의심감지', DISPATCHED: '출동중', IN_PROGRESS: '진행중', CLOSED: '종료' }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// USR-001 대원 메인 화면. 내가 배정된 출동을 확인하고, 현장에서 상태를 보고하며,
// 진입정보·지원요청·위험정보를 주고받는 허브 화면이다.
export function ResponderHomePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const incidentsQuery = useQuery({ queryKey: ['my-active-incidents'], queryFn: getMyActiveIncidents, refetchInterval: 15000 })
  const incidents = incidentsQuery.data ?? []
  const selected = incidents.find((i) => i.incidentId === selectedId) ?? incidents[0] ?? null

  const monitoringQuery = useQuery({
    queryKey: ['monitoring', selected?.incidentId],
    queryFn: () => getMonitoring(selected!.incidentId),
    enabled: !!selected,
    refetchInterval: 15000,
  })

  const { connected, latestAlert } = useIncidentSocket(selected?.incidentId)

  useEffect(() => {
    if (!selected || !latestAlert) return
    queryClient.invalidateQueries({ queryKey: ['alerts', selected.incidentId] })
  }, [latestAlert, selected, queryClient])

  const myAssignment = monitoringQuery.data?.assignments.find((a) => a.userId === user?.userId) ?? null

  return (
    <MobileLayout screenId="USR-001" title="현장 대응" wsConnected={selected ? connected : undefined}>
      <OfflineOutboxStatus />
      <PushEnableButton />
      {incidentsQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
      {incidents.length === 0 && !incidentsQuery.isLoading && (
        <div className="wf-box">현재 배정된 출동이 없습니다.</div>
      )}

      {incidents.length > 1 && (
        <div className="incident-pill-row">
          {incidents.map((incident) => (
            <button
              key={incident.incidentId}
              type="button"
              className={`incident-pill${selected?.incidentId === incident.incidentId ? ' selected' : ''}`}
              onClick={() => setSelectedId(incident.incidentId)}
            >
              {incident.incidentNumber}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="wf" style={{ marginBottom: 14, borderColor: 'var(--color-alert)' }}>
            <div className="wf-header alert">
              <span>
                {selected.incidentNumber} · {INCIDENT_TYPE_LABEL[selected.incidentType] ?? selected.incidentType} ·{' '}
                {STATUS_LABEL[selected.status]}
              </span>
            </div>
            <div className="wf-body" style={{ fontSize: 12.5 }}>
              <div>{selected.address ?? '주소 정보 없음'}</div>
              <div className="alert-meta">{formatDateTime(selected.reportedAt)} 접수</div>
              {myAssignment && (
                <div style={{ marginTop: 8 }}>
                  {myAssignment.roleInIncident ?? '역할 미지정'}
                  {myAssignment.firstWave ? ' · 선발대' : ''}
                  {myAssignment.commsLead && <span className="tag role-responder" style={{ marginLeft: 6 }}>통신담당</span>}
                </div>
              )}
            </div>
          </div>

          {user && <StatusReportPanel incidentId={selected.incidentId} userId={user.userId} />}
          {user && <FieldMissionPanel incidentId={selected.incidentId} userId={user.userId} />}
          {user && <EmergencyOperationsPanel incidentId={selected.incidentId} userId={user.userId} />}
          <SecureEvidenceCapture incidentId={selected.incidentId} />

          <ResponderAlertsPanel incidentId={selected.incidentId} isCommsLead={myAssignment?.commsLead ?? false} />
        </>
      )}
    </MobileLayout>
  )
}

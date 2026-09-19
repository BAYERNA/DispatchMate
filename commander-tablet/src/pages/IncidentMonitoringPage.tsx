import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TabletLayout } from '../components/TabletLayout'
import { Banner } from '../components/Banner'
import { ResponderRow } from '../components/ResponderRow'
import { DroneReconCard } from '../components/DroneReconCard'
import { LiveCameraPanel } from '../components/LiveCameraPanel'
import { AlertsPanel } from '../components/AlertsPanel'
import { AssignResponderPanel } from '../components/AssignResponderPanel'
import { IncidentTimeline } from '../components/IncidentTimeline'
import { OperationsMap } from '../components/OperationsMap'
import { AiFeedbackPanel } from '../components/AiFeedbackPanel'
import { MissionControlPanel } from '../components/MissionControlPanel'
import { AdvancedCommandPanel } from '../components/AdvancedCommandPanel'
import { CloseConfirmDialog } from '../components/CloseConfirmDialog'
import { closeIncident, getAiJudgments, getMonitoring, reassignCommsLead } from '../api/incidents'
import { getAccount } from '../api/accounts'
import { ApiError } from '../api/client'
import { useIncidentSocket } from '../ws/useIncidentSocket'
import './IncidentMonitoringPage.css'

const INCIDENT_TYPE_LABEL: Record<string, string> = { FIRE: '화재', RESCUE: '구조', EMERGENCY: '응급' }
const STATUS_LABEL: Record<string, string> = {
  AI_SUSPECTED: 'AI 의심감지',
  DISPATCHED: '출동중',
  IN_PROGRESS: '진행중',
  CLOSED: '종료',
}

function AssignmentRow({
  userId,
  roleInIncident,
  firstWave,
  commsLead,
  onReassignCommsLead,
  reassigning,
}: {
  userId: string
  roleInIncident: string | null
  firstWave: boolean
  commsLead: boolean
  onReassignCommsLead: () => void
  reassigning: boolean
}) {
  const accountQuery = useQuery({ queryKey: ['account', userId], queryFn: () => getAccount(userId) })
  return (
    <div className="assignment-row">
      <span>
        {accountQuery.data?.name ?? userId.slice(0, 8)}
        {roleInIncident ? ` · ${roleInIncident}` : ''}
        {firstWave ? ' · 선발대' : ''}
      </span>
      {commsLead ? (
        <span className="tag role-commander">통신담당</span>
      ) : (
        <button type="button" className="wf-btn small" disabled={reassigning} onClick={onReassignCommsLead}>
          통신담당 지정
        </button>
      )}
    </div>
  )
}

// CMD-002 현장 모니터링 대시보드 (FR-03, FR-19, FR-26). 위험도 정렬 대원 목록, 드론 정찰 카드,
// 알림·인수인계 피드, 통신담당 재지정, 실시간 WebSocket 갱신, CMD-006 종료 처리 진입점을 한 화면에 모은다.
export function IncidentMonitoringPage() {
  const { incidentId } = useParams<{ incidentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  const [showCloseDialog, setShowCloseDialog] = useState(false)

  const monitoringQuery = useQuery({
    queryKey: ['monitoring', incidentId],
    queryFn: () => getMonitoring(incidentId!),
    enabled: !!incidentId,
    refetchInterval: 10000,
  })

  const judgmentsQuery = useQuery({
    queryKey: ['ai-judgments', incidentId],
    queryFn: () => getAiJudgments(incidentId!),
    enabled: !!incidentId,
  })

  const { connected, latestAlert, latestAck } = useIncidentSocket(incidentId)

  // FR-03/FR-22: WebSocket으로 새 알림·확인이 들어오면 폴링을 기다리지 않고 즉시 갱신한다.
  useEffect(() => {
    if (!incidentId) return
    if (latestAlert) queryClient.invalidateQueries({ queryKey: ['alerts', incidentId] })
  }, [latestAlert, incidentId, queryClient])

  useEffect(() => {
    if (!latestAck) return
    queryClient.invalidateQueries({ queryKey: ['ack-freshness', latestAck.alertId] })
  }, [latestAck, queryClient])

  const reassignMutation = useMutation({
    mutationFn: (userId: string) => reassignCommsLead(incidentId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitoring', incidentId] }),
    onError: (err) => setActionError(err instanceof ApiError ? err.message : '통신담당 재지정에 실패했습니다.'),
  })

  const closeMutation = useMutation({
    mutationFn: () => closeIncident(incidentId!),
    onSuccess: () => {
      setShowCloseDialog(false)
      navigate('/')
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : '출동 종료 처리에 실패했습니다.')
      setShowCloseDialog(false)
    },
  })

  if (!incidentId) return null

  const data = monitoringQuery.data
  const judgments = judgmentsQuery.data ?? []

  return (
    <TabletLayout
      screenId="CMD-002"
      title="현장 모니터링 대시보드"
      onBack={() => navigate('/')}
      wsConnected={connected}
    >
      {actionError && <Banner kind="error" message={actionError} />}

      {monitoringQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}

      {data && (
        <>
          <div className="wf" style={{ marginBottom: 14, borderColor: 'var(--color-alert)' }}>
            <div className="wf-header alert">
              <span>
                {data.incident.incidentNumber} ·{' '}
                {INCIDENT_TYPE_LABEL[data.incident.incidentType] ?? data.incident.incidentType} ·{' '}
                {STATUS_LABEL[data.incident.status]}
              </span>
              <button
                type="button"
                className="wf-btn primary small"
                disabled={data.incident.status === 'CLOSED'}
                onClick={() => setShowCloseDialog(true)}
              >
                CMD-006 출동 종료
              </button>
            </div>
            <div className="wf-body">{data.incident.address ?? '주소 정보 없음'}</div>
          </div>

          <div className="monitoring-layout">
            <div>
              <LiveCameraPanel incidentId={incidentId} />
              <div className="wf" style={{marginBottom:14}}><div className="wf-header"><span>작전 위치</span></div><div className="wf-body"><OperationsMap incidentId={incidentId}/></div></div>

              <div className="wf" style={{ marginBottom: 14 }}>
                <div className="wf-header">
                  <span>현장 대원 상태 (위험도순)</span>
                </div>
                <div className="wf-body">
                  {data.responders.length === 0 && <div className="spinner-text">아직 수신된 대원 상태가 없습니다.</div>}
                  {data.responders.map((status) => (
                    <ResponderRow
                      key={status.userId}
                      status={status}
                      onClick={() => navigate(`/incidents/${incidentId}/responders/${status.userId}`)}
                    />
                  ))}
                </div>
              </div>

              <div className="wf" style={{ marginBottom: 14 }}>
                <div className="wf-header">
                  <span>배정 대원 · 통신담당 (FR-19)</span>
                </div>
                <div className="wf-body">
                  {data.assignments.length === 0 && <div className="spinner-text">배정된 대원이 없습니다.</div>}
                  {data.assignments.map((assignment) => (
                    <AssignmentRow
                      key={assignment.assignmentId}
                      userId={assignment.userId}
                      roleInIncident={assignment.roleInIncident}
                      firstWave={assignment.firstWave}
                      commsLead={assignment.commsLead}
                      reassigning={reassignMutation.isPending}
                      onReassignCommsLead={() => reassignMutation.mutate(assignment.userId)}
                    />
                  ))}
                  {data.incident.status !== 'CLOSED' && (
                    <AssignResponderPanel
                      incidentId={incidentId}
                      assignedUserIds={data.assignments.map((a) => a.userId)}
                    />
                  )}
                </div>
              </div>

              <div className="wf">
                <div className="wf-header">
                  <span>드론 정찰 (FR-26)</span>
                </div>
                <div className="wf-body">
                  {data.droneDispatches.length === 0 && <div className="spinner-text">드론 출동 이력이 없습니다.</div>}
                  {data.droneDispatches.map((dispatch) => (
                    <DroneReconCard key={dispatch.dispatchId} dispatch={dispatch} judgments={judgments} />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <AlertsPanel incidentId={incidentId} assignments={data.assignments} />
              <AiFeedbackPanel judgments={judgments}/>
              <IncidentTimeline incidentId={incidentId}/>
              <MissionControlPanel incidentId={incidentId} assignments={data.assignments}/>
              <AdvancedCommandPanel incidentId={incidentId}/>
            </div>
          </div>
        </>
      )}

      {showCloseDialog && data && (
        <CloseConfirmDialog
          incidentNumber={data.incident.incidentNumber}
          submitting={closeMutation.isPending}
          onCancel={() => setShowCloseDialog(false)}
          onConfirm={() => closeMutation.mutate()}
        />
      )}
    </TabletLayout>
  )
}

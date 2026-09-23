import { apiRequest } from './client'
import type {
  ActiveDroneDispatchResponse,
  AiJudgmentSummaryResponse,
  AssignmentResponse,
  IncidentResponse,
  MonitoringResponse,
  PreAnalysisResponse,
  RouteEstimateResponse,
} from '../types'

export interface AssignRequest {
  userId: string
  roleInIncident?: string
}

// CMD-001 진입 화면: DISPATCHED/IN_PROGRESS 전체 (역할=COMMANDER/ADMIN 전용, backend에서 강제)
export function getActiveIncidents(): Promise<IncidentResponse[]> {
  return apiRequest<IncidentResponse[]>('/api/v1/incidents/active')
}

// CMD-001: 사전분석 결과 + NFR-03 검증용 소요시간
export function getPreAnalysis(incidentId: string): Promise<PreAnalysisResponse> {
  return apiRequest<PreAnalysisResponse>(`/api/v1/incidents/${incidentId}/pre-analysis`)
}

// FR-20 CMD-001: 후발대(소방차) 경로·ETA — 관할 소방서 고정 좌표 기준 근사치, 출동 확정 시 1회 계산.
export function getGroundRouteEstimate(incidentId: string): Promise<RouteEstimateResponse> {
  return apiRequest<RouteEstimateResponse>(`/api/v1/incidents/${incidentId}/route-estimate`)
}

// CMD-002 현장 모니터링 대시보드 전체 데이터
export function getMonitoring(incidentId: string): Promise<MonitoringResponse> {
  return apiRequest<MonitoringResponse>(`/api/v1/incidents/${incidentId}/monitoring`)
}

// Firefly GCS 라이트 지도 뷰: 지금 떠 있는 드론 전체 위치 (역할=COMMANDER/ADMIN 전용, backend에서 강제)
export function getActiveDroneDispatches(): Promise<ActiveDroneDispatchResponse[]> {
  return apiRequest<ActiveDroneDispatchResponse[]>('/api/v1/incidents/drone-dispatches/active')
}

// CMD-002 드론 정찰 카드(FR-26) AI 판단 이력
export function getAiJudgments(incidentId: string): Promise<AiJudgmentSummaryResponse[]> {
  return apiRequest<AiJudgmentSummaryResponse[]>(`/api/v1/incidents/${incidentId}/ai-judgments`)
}

// FR-19: 대원 배정 — 해당 출동의 최초 배정자는 자동으로 선발대·통신담당이 된다 (backend에서 산출).
export function assignResponder(incidentId: string, request: AssignRequest): Promise<AssignmentResponse> {
  return apiRequest<AssignmentResponse>(`/api/v1/incidents/${incidentId}/assignments`, {
    method: 'POST',
    body: request,
  })
}

// FR-19: 지휘관이 통신 담당 재지정
export function reassignCommsLead(incidentId: string, userId: string): Promise<AssignmentResponse> {
  return apiRequest<AssignmentResponse>(`/api/v1/incidents/${incidentId}/assignments/${userId}/comms-lead`, {
    method: 'PATCH',
  })
}

// FR-05 CMD-006 "종료 확정" — QA 최우선 재검증 대상
export function closeIncident(incidentId: string): Promise<IncidentResponse> {
  return apiRequest<IncidentResponse>(`/api/v1/incidents/${incidentId}/close`, { method: 'PATCH' })
}

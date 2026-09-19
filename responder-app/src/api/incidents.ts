import { apiRequest } from './client'
import type { IncidentResponse, MonitoringResponse } from '../types'
import { enqueue,isRetryable } from '../offline/outbox'

export interface ResponderStatusRequest {
  userId: string
  biometricData?: Record<string, unknown>
  environmentData?: Record<string, unknown>
  riskLevel?: 'NORMAL' | 'CAUTION' | 'DANGER'
  connectionStatus?: 'CONNECTED' | 'MESH' | 'SMS' | 'DISCONNECTED'
}

// USR-001 진입 화면: 내가 배정된, 아직 종료되지 않은 출동
export function getMyActiveIncidents(): Promise<IncidentResponse[]> {
  return apiRequest<IncidentResponse[]>('/api/v1/incidents/my-active')
}

// USR-002 보고서 목록에서 출동번호·주소를 함께 보여주기 위한 단건 조회
export function getIncident(incidentId: string): Promise<IncidentResponse> {
  return apiRequest<IncidentResponse>(`/api/v1/incidents/${incidentId}`)
}

// 내 배정정보(통신담당 여부 등)를 확인하기 위해 CMD-002와 동일한 집계 응답을 재사용한다.
export function getMonitoring(incidentId: string): Promise<MonitoringResponse> {
  return apiRequest<MonitoringResponse>(`/api/v1/incidents/${incidentId}/monitoring`)
}

// FR-03/04/12: 대원 실시간 상태 보고. 실제 웨어러블 연동 전이라 이 화면에서는 수동 입력으로 대체한다.
export async function recordResponderStatus(incidentId: string, request: ResponderStatusRequest): Promise<{queued:boolean}> {
  const path=`/api/v1/incidents/${incidentId}/responder-status`
  try { await apiRequest<void>(path, { method: 'POST', body: request }); return {queued:false} }
  catch(error){if(!isRetryable(error))throw error;enqueue(path,'POST',request);return {queued:true}}
}

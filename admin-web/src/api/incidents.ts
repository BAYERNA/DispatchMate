import { apiRequest } from './client'
import type { AiSuspectedQueueItem, IncidentResponse } from '../types'

// ADM-001 "AI 의심감지 대기열" (FR-24)
export function listAiSuspectedQueue(): Promise<AiSuspectedQueueItem[]> {
  return apiRequest<AiSuspectedQueueItem[]>('/api/v1/incidents/dispatch/ai-suspected')
}

// NFR-08: role=ADMIN만 호출 가능 — 서버가 최종 검증하지만, 화면에서도 관리자만 노출한다.
export function confirmIncident(incidentId: string): Promise<IncidentResponse> {
  return apiRequest<IncidentResponse>(`/api/v1/incidents/dispatch/${incidentId}/confirm`, { method: 'PATCH' })
}

export function rejectIncident(incidentId: string): Promise<IncidentResponse> {
  return apiRequest<IncidentResponse>(`/api/v1/incidents/dispatch/${incidentId}/reject`, { method: 'PATCH' })
}

export interface ManualDetectionInput {
  cameraDeviceId: string
  confidenceScore: number
  // Phase 6 ADM-009 통계용 — 등록 당시 실제 관측된 danger_score를 그대로 보낸다(꾸며내지 않음).
  dangerScore?: number
  summary: string
  addressHint?: string
  snapshotBase64?: string | null
}

// ADM-010(Phase 5): 상시 감시 화면에서 위험 카메라를 발견해 수동으로 "출동의심" 등록.
// ai-server 자동 폴링과 결과는 동일(AI_SUSPECTED 생성) — 정식 출동 확정은 여전히 confirmIncident만.
export function registerManualDetection(input: ManualDetectionInput): Promise<string> {
  return apiRequest<string>('/api/v1/incidents/dispatch/manual-detection', { method: 'POST', body: input })
}

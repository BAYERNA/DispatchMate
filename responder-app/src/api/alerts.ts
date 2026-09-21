import { notifyRequest } from './client'
import type { AckFreshnessResponse, AlertResponse } from '../types'
import { enqueue,isRetryable } from '../offline/outbox'

export type OfflineResult<T>={queued:boolean;data?:T}
async function notifyOrQueue<T>(path:string,body:Record<string,unknown>):Promise<OfflineResult<T>>{const payload={...body,clientRequestId:body.clientRequestId??crypto.randomUUID()};try{return{queued:false,data:await notifyRequest<T>(path,{method:'POST',body:payload})}}catch(error){if(!isRetryable(error))throw error;enqueue(`/notify${path}`,'POST',payload);return{queued:true}}}

// USR-001 알림 피드
export function listAlerts(incidentId: string): Promise<AlertResponse[]> {
  return notifyRequest<AlertResponse[]>(`/incidents/${incidentId}/alerts`)
}

// FR-18 진입정보 공유 — 통신담당(is_comms_lead)만 이 화면에 노출한다 (backend는 역할을 강제하지 않음).
export function postEntryInfo(
  incidentId: string,
  payload: { infoCategory: 'ENTRY' | 'HAZARD'; locationLabel: string; statusTag: 'PASSABLE' | 'BLOCKED' | 'DANGER'; message?: string },
): Promise<OfflineResult<AlertResponse>> {
  return notifyOrQueue(`/incidents/${incidentId}/alerts/entry-info`,payload)
}

// FR-23 장비·인력 지원요청 — 배정된 대원 누구나 보낼 수 있다.
export function postSupplyRequest(
  incidentId: string,
  requestedItems: { item: string; qty: number }[],
): Promise<OfflineResult<AlertResponse>> {
  return notifyOrQueue(`/incidents/${incidentId}/alerts/supply-request`,{requestedItems})
}

// FR-06 위험정보 알림 — 현장에서 위험을 발견한 대원이 직접 발신
export function postRiskWarning(
  incidentId: string,
  payload: { targetUserId?: string; channel: 'VOICE' | 'TEXT'; message: string },
): Promise<OfflineResult<AlertResponse>> {
  return notifyOrQueue(`/incidents/${incidentId}/alerts/risk-warning`,payload)
}

// FR-22 "확인했어요"
export async function acknowledgeAlert(alertId: string): Promise<{queued:boolean}> {
  const path=`/alerts/${alertId}/acknowledgements`;try{await notifyRequest<void>(path,{method:'POST'});return{queued:false}}catch(error){if(!isRetryable(error))throw error;enqueue(`/notify${path}`,'POST',{});return{queued:true}}
}

// FR-22 확인자 목록 + 신선도
export function getAckFreshness(alertId: string): Promise<AckFreshnessResponse> {
  return notifyRequest<AckFreshnessResponse>(`/alerts/${alertId}/acknowledgements/freshness`)
}

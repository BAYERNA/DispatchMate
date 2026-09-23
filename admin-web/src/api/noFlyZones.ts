import { apiRequest } from './client'
import type { NoFlyZoneResponse } from '../types'

// 조회는 ADMIN도 가능(backend hasAnyRole('ADMIN','SUPER_ADMIN')) — 등록은 SUPER_ADMIN 전용.
export function listNoFlyZones(): Promise<NoFlyZoneResponse[]> {
  return apiRequest<NoFlyZoneResponse[]>('/api/v1/no-fly-zones')
}

export interface NoFlyZoneCreateInput {
  zoneName: string
  zoneType: string
  centerLatitude: number
  centerLongitude: number
  radiusKm: number
}

export function registerNoFlyZone(input: NoFlyZoneCreateInput): Promise<NoFlyZoneResponse> {
  return apiRequest<NoFlyZoneResponse>('/api/v1/no-fly-zones', { method: 'POST', body: input })
}

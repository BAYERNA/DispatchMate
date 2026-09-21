import { aiStreamRequest, apiRequest } from './client'
import type { CameraResponse, DeviceResponse, DeviceType, LiveDangerSnapshot, Page } from '../types'

export interface DeviceListParams {
  keyword?: string
  deviceType?: string
  page?: number
  size?: number
}

export function listDevices(params: DeviceListParams): Promise<Page<DeviceResponse>> {
  return apiRequest<Page<DeviceResponse>>('/api/v1/devices', {
    query: { keyword: params.keyword, deviceType: params.deviceType, page: params.page, size: params.size },
  })
}

export interface DeviceRegisterInput {
  deviceType: DeviceType
  serialNo: string
  connectionType?: string
  currentUserId?: string
  latitude?: number
  longitude?: number
  batteryLevel?: number
  streamUrl?: string
}

export function registerDevice(input: DeviceRegisterInput): Promise<DeviceResponse> {
  return apiRequest<DeviceResponse>('/api/v1/devices', { method: 'POST', body: input })
}

export function remapDevice(deviceId: string, userId: string): Promise<DeviceResponse> {
  return apiRequest<DeviceResponse>(`/api/v1/devices/${deviceId}/mapping`, { method: 'PATCH', body: { userId } })
}

export function relocateDevice(deviceId: string, latitude: number, longitude: number): Promise<DeviceResponse> {
  return apiRequest<DeviceResponse>(`/api/v1/devices/${deviceId}/location`, {
    method: 'PATCH',
    body: { latitude, longitude },
  })
}

// FR-24/26 CMD-002 라이브 카메라 뷰가 참조할 스트림 주소 등록·수정.
export function updateDeviceStreamUrl(deviceId: string, streamUrl: string): Promise<DeviceResponse> {
  return apiRequest<DeviceResponse>(`/api/v1/devices/${deviceId}/stream-url`, {
    method: 'PATCH',
    body: { streamUrl },
  })
}

// ADM-010 전체 CCTV 상시 감시(Phase 4). commander-tablet CMD-002가 이미 쓰던 좁은 카메라 목록
// 엔드포인트를 그대로 재사용한다 — ADMIN도 hasAnyRole('COMMANDER','ADMIN')에 포함되어 있다.
export function getCameras(): Promise<CameraResponse[]> {
  return apiRequest<CameraResponse[]>('/api/v1/devices/cameras')
}

// ai-server MJPEG 중계 — 순수 영상 중계이며 감지·판단은 하지 않는다(danger는 별도 채널).
export function buildLiveStreamUrl(deviceId: string): string {
  return `/ai-stream/frame?device_id=${encodeURIComponent(deviceId)}`
}

// 디버그 전용 — 감지된 fire/smoke 박스를 프레임 위에 그려서 내보내는 별도 채널(ai-server
// stream_router.py의 /mjpeg-debug). 기본 화면(buildLiveStreamUrl)은 계속 박스 없이 유지하고,
// 이건 사용자가 명시적으로 "박스 보기"를 켰을 때만 쓴다.
export function buildLiveStreamDebugUrl(deviceId: string): string {
  return `/ai-stream/frame?device_id=${encodeURIComponent(deviceId)}&debug=true`
}

// 이 카메라의 현재 위험도 스냅샷. deviceId는 카메라별 깜빡임·확산 이력을 이어가는 키로만 쓰이고,
// incident 생성·확정과는 무관한 읽기 전용 조회다.
export function getLiveDanger(_streamUrl: string, deviceId: string): Promise<LiveDangerSnapshot> {
  return aiStreamRequest<LiveDangerSnapshot>('/danger', { query: { device_id: deviceId } })
}

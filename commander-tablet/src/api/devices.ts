import { aiStreamRequest, apiRequest } from './client'
import type { CameraResponse, DeviceResponse, LiveDangerSnapshot } from '../types'

// CMD-002 드론 정찰 카드: 배정된 드론 기기 상세(배터리·상태)
export function getDevice(deviceId: string): Promise<DeviceResponse> {
  return apiRequest<DeviceResponse>(`/api/v1/devices/${deviceId}`)
}

// CMD-002 라이브 카메라 선택 드롭다운(FR-24/26)
export function getCameras(): Promise<CameraResponse[]> {
  return apiRequest<CameraResponse[]>('/api/v1/devices/cameras')
}

// ai-server MJPEG 중계 엔드포인트 — dev server의 vite.config.ts가 /ai-stream을 ai-server로 프록시한다.
// 순수 영상 중계이며 감지·판단은 하지 않는다 (danger 신호는 별도 채널인 getLiveDanger).
export function buildLiveStreamUrl(deviceId: string): string {
  return `/ai-stream/frame?device_id=${encodeURIComponent(deviceId)}`
}

// 디버그 전용 — 감지된 fire/smoke 박스를 프레임 위에 그려서 내보내는 별도 채널(ai-server
// stream_router.py의 /mjpeg-debug). 기본 화면(buildLiveStreamUrl)은 계속 박스 없이 유지하고,
// 이건 사용자가 명시적으로 "박스 보기"를 켰을 때만 쓴다.
export function buildLiveStreamDebugUrl(deviceId: string): string {
  return `/ai-stream/frame?device_id=${encodeURIComponent(deviceId)}&debug=true`
}

// FR-24/26 Phase 3: 지휘관이 보고 있는 카메라의 현재 위험도 스냅샷. deviceId는 카메라별
// 깜빡임·확산 이력을 이어가기 위한 키로만 쓰이고, incident 생성·확정과는 무관하다(읽기 전용).
export function getLiveDanger(_streamUrl: string, deviceId: string): Promise<LiveDangerSnapshot> {
  return aiStreamRequest<LiveDangerSnapshot>('/danger', { query: { device_id: deviceId } })
}

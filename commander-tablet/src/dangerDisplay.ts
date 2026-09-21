// FR-24/26 라이브 카메라(LiveCameraPanel)·드론 정찰(DroneReconCard) 두 화면이 똑같은 ai-server
// GET /streams/danger 응답을 배지로 표시하므로 표시용 상수를 여기 하나로 모은다.
export const DANGER_LABEL: Record<string, string> = { UNKNOWN: '판단 불가', SAFE: '미검출', WARNING: '주의', DANGER: '위험', CRITICAL: '심각' }

export const DANGER_CLASS: Record<string, string> = {
  UNKNOWN: 'risk-caution',
  SAFE: 'risk-normal',
  WARNING: 'risk-caution',
  DANGER: 'risk-danger',
  CRITICAL: 'risk-critical',
}

export const SPREAD_LABEL: Record<string, string> = {
  UP: '위로 확산',
  DOWN: '아래로 확산',
  LEFT: '왼쪽으로 확산',
  RIGHT: '오른쪽으로 확산',
}

export const DANGER_POLL_INTERVAL_MS = 5000

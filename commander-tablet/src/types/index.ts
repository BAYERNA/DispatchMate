// backend(Java)/notification-server 각 응답 DTO와 1:1로 맞춘 타입. Jackson 기본 camelCase를 그대로 따른다.

export type Role = 'ADMIN' | 'COMMANDER' | 'RESPONDER'

export interface LoginResponse {
  accessToken: string
  userId: string
  name: string
  role: Role
  initialPassword: boolean
}

export interface AccountResponse {
  userId: string
  name: string
  role: Role
  badgeNumber: string
  team: string | null
  phone: string | null
  status: 'ACTIVE' | 'INACTIVE'
  updatedAt: string | null
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
  first: boolean
  last: boolean
}

export type IncidentStatus = 'AI_SUSPECTED' | 'DISPATCHED' | 'IN_PROGRESS' | 'CLOSED'
export type IncidentSource = 'MANUAL_REPORT' | 'CCTV_AUTO_DETECTION'

export interface IncidentResponse {
  incidentId: string
  incidentNumber: string
  incidentType: string
  address: string | null
  latitude: number | null
  longitude: number | null
  reportedAt: string
  closedAt: string | null
  status: IncidentStatus
  source: IncidentSource
  confirmedBy: string | null
  commanderId: string | null
}

// FR-20: 후발대(소방차) 경로·ETA. 관할 소방서 고정 좌표 기준 근사치 — 실제 차량 위치 연동 전까지의 임시값.
export interface RouteEstimateResponse {
  distanceKm: number | null
  etaSeconds: number
  originLabel: string | null
}

// CMD-001: 헤더에 "사전분석 완료 (2.1초)"처럼 소요시간을 표시해 NFR-03(3초 이내) 검증을 가능하게 한다.
export interface PreAnalysisResponse {
  incidentId: string
  buildingInfo: Record<string, unknown> | null
  hazardInfo: Record<string, unknown> | null
  fireHistoryInfo: Record<string, unknown> | null
  dataSource: string | null
  elapsedMillis: number
}

export type RiskLevel = 'NORMAL' | 'CAUTION' | 'DANGER'
export type ConnectionStatus = 'CONNECTED' | 'MESH' | 'SMS' | 'DISCONNECTED'

// CMD-002 annot#1: risk_level 기준(위험→주의→정상) 자동 정렬된 목록의 각 행.
export interface ResponderStatusResponse {
  userId: string
  biometricData: Record<string, unknown> | null
  environmentData: Record<string, unknown> | null
  riskLevel: RiskLevel | string | null
  connectionStatus: ConnectionStatus | string | null
  recordedAt: string
}

export interface AssignmentResponse {
  assignmentId: string
  userId: string
  roleInIncident: string | null
  firstWave: boolean
  commsLead: boolean
  assignedAt: string
}

export interface DroneDispatchResponse {
  dispatchId: string
  droneId: string
  dispatchedAt: string
  arrivedAt: string | null
  status: string
  videoRef: string | null
}

export interface MonitoringResponse {
  incident: IncidentResponse
  responders: ResponderStatusResponse[]
  assignments: AssignmentResponse[]
  droneDispatches: DroneDispatchResponse[]
}

// CMD-002 드론 정찰 카드(FR-26)·CMD-001 등에서 이 출동에 얽힌 AI 판단 이력을 시간순으로 보여줄 때 사용.
export interface AiJudgmentSummaryResponse {
  judgmentId: string
  judgmentType: string
  sourceDeviceId: string | null
  confidenceScore: number | null
  summary: string | null
  createdAt: string
}

export type DeviceType = 'BODYCAM' | 'SMARTPHONE' | 'DIGITAL_MASK' | 'SENSOR' | 'CCTV' | 'DRONE'

export interface DeviceResponse {
  deviceId: string
  deviceType: DeviceType
  serialNo: string
  connectionType: string | null
  currentUserId: string | null
  mappedUserName: string | null
  mappedUserTeam: string | null
  latitude: number | null
  longitude: number | null
  streamUrl: string | null
  status: 'NORMAL' | 'WARNING' | 'DISCONNECTED'
  batteryLevel: number | null
  registeredAt: string
}

// CMD-002 라이브 카메라 선택 드롭다운 전용 — DeviceResponse보다 좁은 필드만 내려온다.
export interface CameraResponse {
  deviceId: string
  deviceType: DeviceType
  serialNo: string
  streamUrl: string | null
  status: 'NORMAL' | 'WARNING' | 'DISCONNECTED'
}

// CMD-002 라이브 카메라 뷰의 위험도 배지(FR-24/26 Phase 3) — ai-server GET /streams/danger 응답.
// callbackSent/incidentId는 이 경로에서 항상 false/null(콜백을 보내지 않으므로) 이라 UI에서 쓰지 않는다.
export type DangerLevel = 'UNKNOWN' | 'SAFE' | 'WARNING' | 'DANGER' | 'CRITICAL'

export interface LiveDangerSnapshot {
  detected: boolean
  confidence: number
  label: string | null
  reason: string | null
  areaRatio: number
  dangerLevel: DangerLevel | string
  dangerScore: number
  isFlickerVerified: boolean | null
  growthRatio: number | null
  spreadDirection: string | null
  spreadSpeedPxPerSec: number | null
}

// notification-server 계약 (alerts.entity.ts / ack.service.ts 실제 응답 형태를 그대로 따른다)
export type AlertType = 'RISK_WARNING' | 'EVACUATION' | 'STATUS_CHANGE' | 'ENTRY_INFO' | 'SUPPLY_REQUEST'
export type InfoCategory = 'ENTRY' | 'HAZARD'
export type StatusTag = 'PASSABLE' | 'BLOCKED' | 'DANGER'
export type AlertSourceType = 'HUMAN' | 'SENSOR' | 'AI' | 'EXTERNAL'
export type AlertChannel = 'VOICE' | 'TEXT'

export interface RequestedItem {
  item: string
  qty: number
}

export interface AlertResponse {
  alertId: string
  incidentId: string
  targetUserId: string | null
  authorId: string | null
  alertType: AlertType | null
  infoCategory: InfoCategory | null
  locationLabel: string | null
  statusTag: StatusTag | null
  requestedItems: RequestedItem[] | null
  sourceType: AlertSourceType
  channel: AlertChannel | null
  message: string | null
  sentAt: string
}

// CMD-002 annot#3: 확인자 목록 + "N분 전 확인, 갱신 필요" 신선도 표시.
export interface AckFreshnessResponse {
  alertId: string
  acknowledgedUserIds: string[]
  lastAcknowledgedAt: string | null
  staleMinutesThreshold: number
  isStale: boolean
}

export interface ApiErrorBody {
  code: string
  message: string
  timestamp: string
  fieldErrors: { field: string; reason: string }[]
}

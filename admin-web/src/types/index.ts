// backend(Java)의 각 도메인 응답 DTO와 1:1로 맞춘 타입. 필드명은 Jackson 기본 camelCase 직렬화를 그대로 따른다.

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'COMMANDER' | 'RESPONDER'

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

export interface AccountCreatedResponse {
  account: AccountResponse
  issuedTemporaryPassword: string
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

// 조직 온보딩(6번): 슈퍼관리자가 조직을 만들고 첫 ADMIN 계정을 발급하는 화면 전용.
export type OrganizationType = 'PUBLIC' | 'CORPORATE'

export interface OrganizationResponse {
  organizationId: string
  code: string
  name: string
  type: OrganizationType
  status: string
  createdAt: string
}

// 비행 전 규제 체크: organizations와 무관한 공유 참조 데이터(no_fly_zones)의 화면 표현.
export interface NoFlyZoneResponse {
  zoneId: string
  zoneName: string
  zoneType: string
  centerLatitude: number
  centerLongitude: number
  radiusKm: number
  active: boolean
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

export interface AiSuspectedQueueItem {
  incidentId: string
  judgmentId: string | null
  sourceDeviceId: string | null
  address: string | null
  detectedAt: string
  confidenceScore: number | null
  status: IncidentStatus
  // 감지 박스가 그려진 증거 스냅샷(JPEG, base64) — 구버전 로그·수동감지 등은 null일 수 있다.
  snapshotBase64: string | null
}

export interface LabeledCount {
  label: string
  count: number
}

export interface GoldenTimeStats {
  existingAverageSeconds: number
  droneAverageArrivalSeconds: number | null
  reductionSeconds: number | null
}

export interface RecentJudgmentItem {
  createdAt: string
  judgmentType: string
  relatedIncidentId: string | null
  confidenceScore: number | null
}

export interface StatisticsSummary {
  totalAiJudgments: number
  sopMatchAccuracyPercent: number
  reviewCompletionRatePercent: number
  averageJudgmentSeconds: number
  goldenTime: GoldenTimeStats
  monthlyJudgmentCounts: LabeledCount[]
  judgmentTypeFrequency: LabeledCount[]
  recentJudgments: RecentJudgmentItem[]
  // Phase 6 FR-24 CCTV 자동 화재감지 지표. cctvDetectionCount가 0이면 아직 감지 이력이 없다는
  // 뜻이라 나머지 둘은 null(정보 없음) — "0"으로 보여주면 "평균적으로 안전했다"는 거짓 신호가 된다.
  cctvDetectionCount: number
  manualDetectionRatioPercent: number | null
  averageCctvDangerScore: number | null
}

// ADM-010 전체 CCTV 상시 감시(Phase 4) 전용 — commander-tablet CMD-002와 동일한 계약.
export interface CameraResponse {
  deviceId: string
  deviceType: DeviceType
  serialNo: string
  streamUrl: string | null
  status: 'NORMAL' | 'WARNING' | 'DISCONNECTED'
}

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
  snapshotBase64: string | null
}

export interface ApiErrorBody {
  code: string
  message: string
  timestamp: string
  fieldErrors: { field: string; reason: string }[]
}

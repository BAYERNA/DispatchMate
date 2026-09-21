import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { Banner } from '../components/Banner'
import { SecureCamera } from '../components/SecureCamera'
import { freshDanger } from '../freshDanger'
import { useNow } from '../useNow'
import { buildLiveStreamDebugUrl, buildLiveStreamUrl, getCameras, getLiveDanger } from '../api/devices'
import { registerManualDetection } from '../api/incidents'
import { ApiError } from '../api/client'
import type { CameraResponse, LiveDangerSnapshot } from '../types'

// 이 등급부터 관제실이 "출동의심 등록" 버튼을 볼 수 있다. WARNING은 아직 오탐 가능성이 커서
// (yolo_service.py DANGER_SCORE_WARNING 문턱값 기준) 사람이 서둘러 개입할 신호로 쓰지 않는다.
const MANUAL_DETECTION_THRESHOLD: Record<string, boolean> = { DANGER: true, CRITICAL: true }

const DANGER_POLL_INTERVAL_MS = 8000

const DANGER_LABEL: Record<string, string> = { UNKNOWN: '판단 불가', SAFE: '미검출', WARNING: '주의', DANGER: '위험', CRITICAL: '심각' }
const DANGER_CLASS: Record<string, string> = {
  UNKNOWN: 'risk-caution',
  SAFE: 'risk-normal',
  WARNING: 'risk-caution',
  DANGER: 'risk-danger',
  CRITICAL: 'risk-critical',
}
// 정렬 우선순위 계산용. 아직 판단이 안 된(로딩·오류) 카메라는 SAFE와 동급으로 취급해 화면이
// 매 폴링마다 크게 들썩이지 않게 한다 — 실제로 위험하다고 확인된 카메라만 앞으로 끌어올린다.
const DANGER_RANK: Record<string, number> = { CRITICAL: 3, DANGER: 2, WARNING: 1, SAFE: 0 }

function CameraTile({ camera, danger, dangerError }: { camera: CameraResponse; danger?: LiveDangerSnapshot; dangerError: boolean }) {
  const [registeredIncidentId, setRegisteredIncidentId] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)
  // 디버그 전용 토글 — 기본은 꺼져 있어 운영 화면은 항상 박스 없는 순수 영상이다. 켰을 때만
  // /mjpeg-debug로 바꿔 감지 박스를 확인한다(영상·판단 분리 원칙은 기본값에서 그대로 유지).
  const [showDebugBoxes, setShowDebugBoxes] = useState(false)

  const registerMutation = useMutation({
    mutationFn: () =>
      registerManualDetection({
        cameraDeviceId: camera.deviceId,
        confidenceScore: (danger?.confidence ?? 0) * 100,
        dangerScore: danger?.dangerScore,
        summary: `관제실 수동 등록 (ADM-010, label=${danger?.label ?? '미상'}, danger=${danger?.dangerLevel}, score=${Math.round(danger?.dangerScore ?? 0)})`,
        snapshotBase64: danger?.snapshotBase64 ?? null,
      }),
    onSuccess: (incidentId) => {
      setRegisterError(null)
      setRegisteredIncidentId(incidentId)
    },
    onError: (err) => setRegisterError(err instanceof ApiError ? err.message : '출동의심 등록에 실패했습니다.'),
  })

  const showRegisterButton = danger && MANUAL_DETECTION_THRESHOLD[danger.dangerLevel] && !registeredIncidentId

  return (
    <div className="wf" style={{ marginBottom: 0 }}>
      <div className="wf-header">
        <span>{camera.serialNo}</span>
        {danger && (
          <span className={`tag ${DANGER_CLASS[danger.dangerLevel] ?? ''}`}>
            {DANGER_LABEL[danger.dangerLevel] ?? '판단 불가'}{danger.dangerLevel !== 'UNKNOWN' && ` · ${Math.round(danger.dangerScore)}`}
          </span>
        )}
      </div>
      <div className="wf-body" style={{ padding: 0 }}>
        <SecureCamera
          alt={`${camera.serialNo} 실시간 영상${showDebugBoxes ? ' (감지 박스 디버그 보기)' : ''}`}
          src={showDebugBoxes ? buildLiveStreamDebugUrl(camera.deviceId) : buildLiveStreamUrl(camera.deviceId)}
          style={{ width: '100%', display: 'block' }}
        />
      </div>
      <div className="wf-body" style={{ paddingTop: 6, paddingBottom: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--color-ink-soft)' }}>
          <input type="checkbox" checked={showDebugBoxes} onChange={(e) => setShowDebugBoxes(e.target.checked)} />
          감지 박스 보기 (디버그용 — 운영 판단은 위 배지를 기준으로 하세요)
        </label>
      </div>
      {(dangerError || danger?.dangerLevel === 'UNKNOWN' || (danger && danger.isFlickerVerified === false)) && (
        <div className="wf-body" style={{ paddingTop: 6, fontSize: 12, color: 'var(--color-ink-soft)' }}>
          {dangerError ? '위험도 확인 실패 — 안전으로 판단하지 마세요.' : danger?.dangerLevel === 'UNKNOWN' ? danger.reason ?? '분석할 수 없습니다.' : '오탐 의심(깜빡임 없음)'}
        </div>
      )}
      {showRegisterButton && (
        <div className="wf-body" style={{ paddingTop: 8 }}>
          <button
            type="button"
            className="wf-btn primary small"
            disabled={registerMutation.isPending}
            onClick={() => registerMutation.mutate()}
          >
            {registerMutation.isPending ? '등록 중…' : '출동의심 등록'}
          </button>
        </div>
      )}
      {registeredIncidentId && (
        <div className="wf-body" style={{ paddingTop: 8 }}>
          <Banner kind="success" message="출동의심으로 등록했습니다. ADM-001 대기열에서 확인·출동을 확정하세요." />
          <Link to="/" className="wf-btn small" style={{ marginTop: 6, display: 'inline-block' }}>
            ADM-001로 이동
          </Link>
        </div>
      )}
      {registerError && (
        <div className="wf-body" style={{ paddingTop: 8 }}>
          <Banner kind="error" message={registerError} />
        </div>
      )}
    </div>
  )
}

// ADM-010 전체 CCTV 상시 감시(Phase 4/5). 원 와이어프레임 15개 화면 스펙 밖의 신규 추가 화면 —
// 출동과 무관하게 등록된 CCTV 전체를 관제실이 상시 훑어볼 수 있게 한다. CMD-002 라이브 카메라
// 뷰(Phase 2/3)는 지휘관이 특정 출동에서 카메라를 수동으로 고르는 화면이지만, 여기는 그 반대 —
// 출동이 생기기 전부터 이상 징후를 먼저 포착하려는 상시 모니터링 목적이라 자동으로 전부 띄운다.
// 위험도가 높은 카메라를 먼저 보여주되(위험도순 정렬은 CMD-002 대원 목록과 동일한 패턴), 영상
// 위에 감지 박스는 여전히 그리지 않는다 — 영상과 판단 채널을 분리해 온 원칙을 그대로 지킨다.
// Phase 5: DANGER/CRITICAL 카메라에는 "출동의심 등록" 버튼이 떠서, ai-server의 CCTV 자동 폴링을
// 기다리지 않고도 관제실이 직접 AI_SUSPECTED 출동을 만들 수 있다 — 정식 출동 전환(NFR-08)은
// 여전히 오직 ADM-001의 확인·출동(role=ADMIN)에서만 이뤄진다.
export function CctvMonitorPage() {
  const now = useNow()
  const camerasQuery = useQuery({ queryKey: ['cameras'], queryFn: getCameras, refetchInterval: 30000 })
  const cameras = camerasQuery.data ?? []
  const withStream = cameras.filter((c) => c.streamUrl)
  const withoutStream = cameras.filter((c) => !c.streamUrl)

  const dangerQueries = useQueries({
    queries: withStream.map((camera) => ({
      queryKey: ['live-danger', camera.deviceId],
      queryFn: () => getLiveDanger(camera.streamUrl!, camera.deviceId),
      refetchInterval: DANGER_POLL_INTERVAL_MS,
      retry: false,
    })),
  })

  const tiles = withStream
    .map((camera, i) => ({ camera, danger: freshDanger(dangerQueries[i]?.data, dangerQueries[i]?.isError ?? false, dangerQueries[i]?.dataUpdatedAt ?? 0, now), error: dangerQueries[i]?.isError ?? false }))
    .sort((a, b) => (DANGER_RANK[b.danger?.dangerLevel ?? 'SAFE'] ?? 0) - (DANGER_RANK[a.danger?.dangerLevel ?? 'SAFE'] ?? 0))

  return (
    <AdminLayout screenId="ADM-010" title="전체 CCTV 상시 감시">
      {camerasQuery.isLoading && <div className="spinner-text">카메라 목록 불러오는 중…</div>}
      {!camerasQuery.isLoading && cameras.length === 0 && (
        <div className="wf-box">등록된 CCTV가 없습니다. ADM-006에서 먼저 등록하세요.</div>
      )}

      {tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>
          {tiles.map(({ camera, danger, error }) => (
            <CameraTile key={camera.deviceId} camera={camera} danger={danger} dangerError={error} />
          ))}
        </div>
      )}

      {withoutStream.length > 0 && (
        <div className="wf">
          <div className="wf-header">
            <span>스트림 미등록 카메라 ({withoutStream.length}대)</span>
          </div>
          <div className="wf-body">
            {withoutStream.map((camera) => (
              <div key={camera.deviceId} style={{ padding: '4px 0', fontSize: 12.5, color: 'var(--color-ink-soft)' }}>
                {camera.serialNo}
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <Link to="/devices" className="wf-btn small">
                ADM-006에서 스트림 주소 등록
              </Link>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

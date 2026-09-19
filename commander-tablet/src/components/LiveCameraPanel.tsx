import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { postAiRiskWarning } from '../api/alerts'
import { buildLiveStreamDebugUrl, buildLiveStreamUrl, getCameras, getLiveDanger } from '../api/devices'
import { DANGER_CLASS, DANGER_LABEL, DANGER_POLL_INTERVAL_MS, SPREAD_LABEL } from '../dangerDisplay'
import type { CameraResponse } from '../types'
import { SecureCamera } from './SecureCamera'
import { freshDanger } from '../freshDanger'
import { useNow } from '../useNow'

// 카메라 한 대의 영상 + 위험도 배지. 위험도는 영상 위에 겹쳐 그리지 않는다 — ai-server의
// /streams/mjpeg(영상)와 /streams/danger(판단)가 애초에 분리된 채널이라 UI도 그 경계를 유지한다.
// Phase 6: CRITICAL로 새로 올라간 순간(이미 CRITICAL이던 상태에서 폴링될 때마다 X) 딱 한 번
// FR-06 위험경고를 자동 발송한다 — CRITICAL 구간이 끝나(SAFE/WARNING/DANGER로 내려가) 다음
// CRITICAL 구간이 다시 시작되면 재발송된다.
function LiveCameraTile({
  incidentId,
  camera,
  failed,
}: {
  incidentId: string
  camera: CameraResponse
  failed: boolean
}) {
  const dangerQuery = useQuery({
    queryKey: ['live-danger', camera.deviceId],
    queryFn: () => getLiveDanger(camera.streamUrl!, camera.deviceId),
    enabled: !failed,
    refetchInterval: DANGER_POLL_INTERVAL_MS,
    retry: false,
  })
  const now = useNow()
  const danger = freshDanger(dangerQuery.data, dangerQuery.isError, dangerQuery.dataUpdatedAt, now)
  // 디버그 전용 토글 — 기본은 꺼져 있어 운영 화면은 항상 박스 없는 순수 영상이다. 켰을 때만
  // /mjpeg-debug로 바꿔 감지 박스를 확인한다(영상·판단 분리 원칙은 기본값에서 그대로 유지).
  const [showDebugBoxes, setShowDebugBoxes] = useState(false)

  const alertMutation = useMutation({ mutationFn: (message: string) => postAiRiskWarning(incidentId, message) })
  // 이전 폴링의 등급을 ref로 들고 있다가 "방금 CRITICAL로 새로 올라간 순간"만 걸러낸다 — 렌더링
  // 트리거용 state가 아니라서 setState-in-effect 문제 없이 exhaustive-deps를 그대로 만족시킨다.
  const previousLevelRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const level = danger?.dangerLevel
    if (!level || level === 'UNKNOWN') return
    const wasCritical = previousLevelRef.current === 'CRITICAL'
    previousLevelRef.current = level
    if (danger && level === 'CRITICAL' && !wasCritical) {
      alertMutation.mutate(
        `${camera.serialNo} 카메라 위험도 심각(CRITICAL, 점수 ${Math.round(danger.dangerScore)}) — AI 자동 감지, 즉시 확인이 필요합니다.`,
      )
    }
  }, [danger, camera.serialNo, alertMutation])

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 4, color: 'var(--color-ink-soft)' }}>{camera.serialNo}</div>
      {failed ? (
        <div className="wf-box" style={{ color: 'var(--color-alert)' }}>
          영상 연결 실패 — 카메라 전원·네트워크를 확인하세요.
        </div>
      ) : (
        <SecureCamera
          alt={`${camera.serialNo} 실시간 영상${showDebugBoxes ? ' (감지 박스 디버그 보기)' : ''}`}
          src={showDebugBoxes ? buildLiveStreamDebugUrl(camera.deviceId) : buildLiveStreamUrl(camera.deviceId)}
          style={{ width: '100%', borderRadius: 6, border: '1px solid var(--color-border-soft)', display: 'block' }}
        />
      )}
      {!failed && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--color-ink-soft)' }}>
          <input type="checkbox" checked={showDebugBoxes} onChange={(e) => setShowDebugBoxes(e.target.checked)} />
          감지 박스 보기 (디버그용 — 운영 판단은 아래 배지를 기준으로 하세요)
        </label>
      )}
      {!failed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
          {danger ? (
            <>
              <span className={`tag ${DANGER_CLASS[danger.dangerLevel] ?? ''}`}>
                {DANGER_LABEL[danger.dangerLevel] ?? '판단 불가'}{danger.dangerLevel !== 'UNKNOWN' && ` · ${Math.round(danger.dangerScore)}`}
              </span>
              {danger.dangerLevel === 'UNKNOWN' && <span role="status">{danger.reason ?? '분석할 수 없습니다.'}</span>}
              {danger.growthRatio != null && danger.growthRatio > 1 && (
                <span style={{ color: 'var(--color-ink-soft)' }}>
                  확산 {danger.growthRatio.toFixed(1)}배
                  {danger.spreadDirection && ` · ${SPREAD_LABEL[danger.spreadDirection] ?? danger.spreadDirection}`}
                </span>
              )}
              {danger.isFlickerVerified === false && (
                <span style={{ color: 'var(--color-ink-soft)' }}>오탐 의심(깜빡임 없음)</span>
              )}
              {danger.dangerLevel === 'CRITICAL' && alertMutation.isSuccess && (
                <span style={{ color: 'var(--color-alert)' }}>⚠ 위험경고 자동발송됨</span>
              )}
            </>
          ) : dangerQuery.isError ? (
            <span style={{ color: 'var(--color-ink-soft)' }}>위험도 확인 실패</span>
          ) : (
            <span style={{ color: 'var(--color-ink-soft)' }}>위험도 판단 중…</span>
          )}
        </div>
      )}
    </div>
  )
}

// CMD-002 라이브 카메라 뷰 (FR-24/26). 지휘관이 등록된 CCTV 중 보고 싶은 카메라를 직접
// 골라서 본다 — 출동과 카메라를 시스템이 자동으로 연결해주는 기능은 아니다(DB에 그 연결 정보가
// 없다). 영상은 순수 중계이고, 위험도 배지는 지금 보고 있는 그 카메라의 스냅샷을 주기적으로
// 다시 읽어와 옆에만 표시한다(영상 위에 겹쳐 그리지 않는다). Phase 6: incidentId는 CRITICAL
// 감지 시 FR-06 위험경고를 어느 출동 알림 피드로 보낼지 정하는 데만 쓰인다 — "이 카메라가 이
// 출동 소속"이라는 걸 시스템이 판단해서가 아니라, 지휘관이 지금 이 출동 화면에서 이 카메라를
// 보고 있다는 사실 자체가 그 연결의 근거다.
export function LiveCameraPanel({ incidentId }: { incidentId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [watchingIds, setWatchingIds] = useState<string[]>([])
  const [failedIds, setFailedIds] = useState<string[]>([])

  const camerasQuery = useQuery({ queryKey: ['cameras'], queryFn: getCameras, enabled: expanded })
  const cameras = camerasQuery.data ?? []
  const watching = cameras.filter((c) => watchingIds.includes(c.deviceId))

  function toggleWatch(deviceId: string) {
    setFailedIds((prev) => prev.filter((id) => id !== deviceId))
    setWatchingIds((prev) => (prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]))
  }

  return (
    <div className="wf" style={{ marginBottom: 14 }}>
      <div className="wf-header">
        <span>라이브 카메라 (FR-24/26)</span>
        <button type="button" className="wf-btn small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '목록 닫기' : '카메라 선택'}
        </button>
      </div>
      <div className="wf-body">
        {expanded && (
          <div style={{ marginBottom: watching.length > 0 ? 10 : 0 }}>
            {camerasQuery.isLoading && <div className="spinner-text">카메라 목록 불러오는 중…</div>}
            {!camerasQuery.isLoading && cameras.length === 0 && (
              <div className="spinner-text">등록된 CCTV가 없습니다. ADM-006에서 먼저 등록하세요.</div>
            )}
            {cameras.map((camera) => (
              <label
                key={camera.deviceId}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5 }}
              >
                <input
                  type="checkbox"
                  checked={watchingIds.includes(camera.deviceId)}
                  disabled={!camera.streamUrl}
                  onChange={() => toggleWatch(camera.deviceId)}
                />
                {camera.serialNo}
                {!camera.streamUrl && <span style={{ color: 'var(--color-ink-soft)' }}> · 스트림 주소 미등록</span>}
              </label>
            ))}
          </div>
        )}

        {watching.length === 0 && !expanded && (
          <div className="spinner-text">"카메라 선택"을 눌러 볼 카메라를 고르세요.</div>
        )}

        {watching.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {watching.map((camera) => (
              <LiveCameraTile
                key={camera.deviceId}
                incidentId={incidentId}
                camera={camera}
                failed={failedIds.includes(camera.deviceId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

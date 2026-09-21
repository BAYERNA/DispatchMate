import { useQuery } from '@tanstack/react-query'
import { SecureCamera } from './SecureCamera'
import { freshDanger } from '../freshDanger'
import { useNow } from '../useNow'
import { buildLiveStreamUrl, getDevice, getLiveDanger } from '../api/devices'
import { DANGER_CLASS, DANGER_LABEL, DANGER_POLL_INTERVAL_MS } from '../dangerDisplay'
import type { AiJudgmentSummaryResponse, DroneDispatchResponse } from '../types'

const STATUS_LABEL: Record<string, string> = {
  EN_ROUTE: '출동중',
  ON_SITE: '현장도착',
  RETURNED: '복귀',
}
// 복귀한 드론은 스트림이 이미 꺼져 있을 것이므로 폴링을 멈춘다 — RETURNED 이후엔 정찰 영상(videoRef,
// 녹화본 참조)만 의미가 있다.
const LIVE_STATUSES = new Set(['EN_ROUTE', 'ON_SITE'])

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

// CMD-002 드론 정찰 카드 (FR-26): 드론 출동 현황 + 배터리/상태 + AI 판단(정찰 결과) 이력.
// Phase 5: CCTV(LiveCameraPanel)와 동일한 채널(ai-server MJPEG 중계·위험도 스냅샷)을 드론
// 기기에도 그대로 재사용한다 — 드론도 CCTV처럼 stream_url을 등록할 수 있는 고정 자산 타입이라
// (DeviceType.isFixedLocationAsset) 별도 백엔드 변경 없이 붙는다. 영상 위에 감지 박스는 여전히
// 그리지 않는다.
export function DroneReconCard({
  dispatch,
  judgments,
}: {
  dispatch: DroneDispatchResponse
  judgments: AiJudgmentSummaryResponse[]
}) {
  const videoFailed = false
  const deviceQuery = useQuery({ queryKey: ['device', dispatch.droneId], queryFn: () => getDevice(dispatch.droneId) })
  const relatedJudgments = judgments.filter((j) => j.sourceDeviceId === dispatch.droneId)

  const streamUrl = deviceQuery.data?.streamUrl
  const showLiveFeed = !!streamUrl && LIVE_STATUSES.has(dispatch.status)

  const dangerQuery = useQuery({
    queryKey: ['live-danger', dispatch.droneId],
    queryFn: () => getLiveDanger(streamUrl!, dispatch.droneId),
    enabled: showLiveFeed && !videoFailed,
    refetchInterval: DANGER_POLL_INTERVAL_MS,
    retry: false,
  })
  const now = useNow()
  const danger = freshDanger(dangerQuery.data, dangerQuery.isError, dangerQuery.dataUpdatedAt, now)

  return (
    <div className="wf" style={{ marginBottom: 10 }}>
      <div className="wf-header">
        <span>
          드론 {deviceQuery.data?.serialNo ?? dispatch.droneId.slice(0, 8)} · {STATUS_LABEL[dispatch.status] ?? dispatch.status}
        </span>
        <span>
          {deviceQuery.data?.batteryLevel != null ? `배터리 ${deviceQuery.data.batteryLevel}%` : ''}
        </span>
      </div>
      <div className="wf-body">
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>
          출동 {formatTime(dispatch.dispatchedAt)} · 도착 {formatTime(dispatch.arrivedAt)}
        </div>

        {showLiveFeed && (
          <div style={{ marginBottom: 8 }}>
            {videoFailed ? (
              <div className="wf-box" style={{ color: 'var(--color-alert)' }}>
                영상 연결 실패 — 드론 전원·네트워크를 확인하세요.
              </div>
            ) : (
              <SecureCamera
                alt={`드론 ${deviceQuery.data?.serialNo ?? dispatch.droneId.slice(0, 8)} 실시간 영상`}
                src={buildLiveStreamUrl(dispatch.droneId)}
                style={{ width: '100%', borderRadius: 6, border: '1px solid var(--color-border-soft)', display: 'block' }}
              />
            )}
            {!videoFailed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
                {danger ? (
                  <span className={`tag ${DANGER_CLASS[danger.dangerLevel] ?? ''}`}>
                    {DANGER_LABEL[danger.dangerLevel] ?? '판단 불가'}{danger.dangerLevel === 'UNKNOWN' ? ` · ${danger.reason ?? '분석 불가'}` : ` · ${Math.round(danger.dangerScore)}`}
                  </span>
                ) : dangerQuery.isError ? (
                  <span style={{ color: 'var(--color-ink-soft)' }}>위험도 확인 실패</span>
                ) : (
                  <span style={{ color: 'var(--color-ink-soft)' }}>위험도 판단 중…</span>
                )}
              </div>
            )}
          </div>
        )}

        {dispatch.videoRef && (
          <div className="wf-box" style={{ marginBottom: 8 }}>
            <span className="label">정찰 영상</span>
            <div>{dispatch.videoRef}</div>
          </div>
        )}
        {relatedJudgments.length === 0 && <div className="spinner-text">아직 AI 판단 결과가 없습니다.</div>}
        {relatedJudgments.map((judgment) => (
          <div key={judgment.judgmentId} className="wf-box" style={{ marginBottom: 6 }}>
            <span className="label">
              {formatTime(judgment.createdAt)} ·{' '}
              {judgment.confidenceScore != null ? `신뢰도 ${Math.round(judgment.confidenceScore)}%` : '신뢰도 미상'}
            </span>
            <div>{judgment.summary ?? '요약 없음'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

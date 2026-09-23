import { useQuery } from '@tanstack/react-query'
import { TabletLayout } from '../components/TabletLayout'
import { getActiveDroneDispatches } from '../api/incidents'
import type { ActiveDroneDispatchResponse } from '../types'
import './DroneMapPage.css'

const STATUS_LABEL: Record<string, string> = { EN_ROUTE: '이동중', ON_SITE: '현장 도착' }

const MAP_WIDTH = 640
const MAP_HEIGHT = 420
const MAP_PADDING = 40

interface Point {
  x: number
  y: number
}

interface Bounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

function computeBounds(coords: { lat: number; lon: number }[]): Bounds {
  const lats = coords.map((c) => c.lat)
  const lons = coords.map((c) => c.lon)
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) }
}

// 위경도를 SVG 좌표로 투영한다 — 진짜 지도 타일 없이, 이번 화면에 나온 좌표들의 범위 안에서
// 상대 위치만 정확하게 보여주는 "라이트" 버전(Firefly GCS lite)이라는 전제를 그대로 반영한다.
function project(lat: number, lon: number, bounds: Bounds): Point {
  const latRange = bounds.maxLat - bounds.minLat || 0.001
  const lonRange = bounds.maxLon - bounds.minLon || 0.001
  const x = MAP_PADDING + ((lon - bounds.minLon) / lonRange) * (MAP_WIDTH - 2 * MAP_PADDING)
  const y = MAP_HEIGHT - MAP_PADDING - ((lat - bounds.minLat) / latRange) * (MAP_HEIGHT - 2 * MAP_PADDING)
  return { x, y }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

// Firefly GCS 라이트 버전: 실제 DroneDispatch/Device 좌표로 "지금 배차된 드론들이 어디쯤 있는지"만
// 보여준다 — 실시간 텔레메트리가 아니라(backend에 없음) Device.latitude/longitude(관제실이 마지막으로
// 확인/입력한 위치)라는 점을 화면에도 그대로 밝힌다.
export function DroneMapPage() {
  const dispatchesQuery = useQuery({
    queryKey: ['active-drone-dispatches'],
    queryFn: getActiveDroneDispatches,
    refetchInterval: 10000,
  })
  const dispatches = dispatchesQuery.data ?? []

  const plottable = dispatches.filter(
    (d) => d.droneLatitude != null && d.droneLongitude != null && d.targetLatitude != null && d.targetLongitude != null,
  )

  const bounds =
    plottable.length > 0
      ? computeBounds(
          plottable.flatMap((d) => [
            { lat: d.droneLatitude as number, lon: d.droneLongitude as number },
            { lat: d.targetLatitude as number, lon: d.targetLongitude as number },
          ]),
        )
      : null

  return (
    <TabletLayout screenId="CMD-004" title="드론 배치 지도 (Firefly GCS Lite)">
      <div className="wf">
        <div className="wf-header">
          <span>실시간 배차 드론 ({dispatches.length}대)</span>
          <span className="drone-map-legend">
            <span className="drone-map-legend-item">
              <span className="drone-map-dot" style={{ background: 'var(--color-drone)' }} /> 드론 위치
            </span>
            <span className="drone-map-legend-item">
              <span className="drone-map-dot" style={{ background: 'var(--color-alert)' }} /> 목표(사건) 위치
            </span>
          </span>
        </div>
        <div className="wf-body">
          {dispatchesQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {dispatchesQuery.isError && <div className="spinner-text">드론 배치 정보를 불러오지 못했습니다.</div>}
          {!dispatchesQuery.isLoading && dispatches.length === 0 && (
            <div className="spinner-text">현재 배차 중인 드론이 없습니다.</div>
          )}

          {bounds && (
            <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="drone-map-svg" role="img" aria-label="드론 배치 지도">
              <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} className="drone-map-bg" />
              {plottable.map((d) => {
                const drone = project(d.droneLatitude as number, d.droneLongitude as number, bounds)
                const target = project(d.targetLatitude as number, d.targetLongitude as number, bounds)
                return (
                  <g key={d.dispatchId}>
                    <line x1={drone.x} y1={drone.y} x2={target.x} y2={target.y} className="drone-map-line" />
                    <circle cx={target.x} cy={target.y} r={7} fill="var(--color-alert)" />
                    <text x={target.x + 10} y={target.y + 4} className="drone-map-label">
                      {d.incidentNumber}
                    </text>
                    <circle cx={drone.x} cy={drone.y} r={9} fill="var(--color-drone)" />
                    <text x={drone.x + 12} y={drone.y + 4} className="drone-map-label">
                      {d.droneSerialNo ?? '드론'}
                      {d.droneBatteryLevel != null ? ` (${d.droneBatteryLevel}%)` : ''}
                    </text>
                  </g>
                )
              })}
            </svg>
          )}

          {dispatches.length > 0 && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>사건번호</th>
                  <th>주소</th>
                  <th>드론</th>
                  <th>배터리</th>
                  <th>상태</th>
                  <th>배차 시각</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d: ActiveDroneDispatchResponse) => (
                  <tr key={d.dispatchId}>
                    <td>{d.incidentNumber}</td>
                    <td>{d.incidentAddress ?? '—'}</td>
                    <td>{d.droneSerialNo ?? '—'}</td>
                    <td>{d.droneBatteryLevel != null ? `${d.droneBatteryLevel}%` : '—'}</td>
                    <td>
                      <span className="tag">{STATUS_LABEL[d.dispatchStatus] ?? d.dispatchStatus}</span>
                    </td>
                    <td>{formatTime(d.dispatchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </TabletLayout>
  )
}

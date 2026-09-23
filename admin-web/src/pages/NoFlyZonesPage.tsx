import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { Banner } from '../components/Banner'
import { ApiError } from '../api/client'
import { listNoFlyZones, registerNoFlyZone, type NoFlyZoneCreateInput } from '../api/noFlyZones'

const ZONE_TYPE_LABEL: Record<string, string> = {
  AIRPORT: '공항 관제권',
  MILITARY: '군사시설',
  EVENT: '행사장',
  DEMO: '데모(예시)',
  CUSTOM: '기타',
}

const EMPTY_FORM: NoFlyZoneCreateInput = {
  zoneName: '',
  zoneType: 'CUSTOM',
  centerLatitude: 0,
  centerLongitude: 0,
  radiusKm: 1,
}

// 비행 전 규제 체크(FAIND 사업계획서 "관제권/비행금지구역 사전 확인"): SUPER_ADMIN이 원형 구역
// (중심좌표+반경)을 등록하면 DroneDispatchService.autoDispatch()가 목표 좌표를 대조한다.
// 실제 국토교통부 비행금지구역 API 연동 전까지는 여기서 등록한 구역이 곧 판단 기준 전부다 —
// OrganizationsPage와 같은 이유로 조직과 무관한 플랫폼 공유 데이터라 SUPER_ADMIN 전용 화면이다.
export function NoFlyZonesPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<NoFlyZoneCreateInput>(EMPTY_FORM)
  const [createError, setCreateError] = useState<string | null>(null)

  const query = useQuery({ queryKey: ['no-fly-zones'], queryFn: listNoFlyZones })

  const createMutation = useMutation({
    mutationFn: (input: NoFlyZoneCreateInput) => registerNoFlyZone(input),
    onSuccess: () => {
      setCreateError(null)
      setForm(EMPTY_FORM)
      queryClient.invalidateQueries({ queryKey: ['no-fly-zones'] })
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : '비행금지구역 등록에 실패했습니다.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setCreateError(null)
    createMutation.mutate(form)
  }

  return (
    <AdminLayout screenId="SUPER-002" title="비행금지구역 관리">
      <div className="wf" style={{ maxWidth: 640, marginBottom: 20 }}>
        <div className="wf-header">
          <span>구역 등록</span>
        </div>
        <form className="wf-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="zoneName">
                구역명
              </label>
              <input
                id="zoneName"
                className="wf-field"
                placeholder="예: OO공항 관제권"
                value={form.zoneName}
                onChange={(e) => setForm((f) => ({ ...f, zoneName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="zoneType">
                구역 유형
              </label>
              <select
                id="zoneType"
                className="wf-field"
                value={form.zoneType}
                onChange={(e) => setForm((f) => ({ ...f, zoneType: e.target.value }))}
              >
                {Object.entries(ZONE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="centerLatitude">
                중심 위도
              </label>
              <input
                id="centerLatitude"
                type="number"
                step="any"
                className="wf-field"
                value={form.centerLatitude}
                onChange={(e) => setForm((f) => ({ ...f, centerLatitude: Number(e.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="centerLongitude">
                중심 경도
              </label>
              <input
                id="centerLongitude"
                type="number"
                step="any"
                className="wf-field"
                value={form.centerLongitude}
                onChange={(e) => setForm((f) => ({ ...f, centerLongitude: Number(e.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="radiusKm">
                반경 (km)
              </label>
              <input
                id="radiusKm"
                type="number"
                step="any"
                min="0.01"
                className="wf-field"
                value={form.radiusKm}
                onChange={(e) => setForm((f) => ({ ...f, radiusKm: Number(e.target.value) }))}
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="wf-btn primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? '등록 중…' : '구역 등록'}
            </button>
          </div>
          {createError && <Banner kind="error" message={createError} />}
        </form>
      </div>

      <div className="wf">
        <div className="wf-header">
          <span>등록된 구역</span>
        </div>
        <div className="wf-body">
          {query.isLoading && <div className="spinner-text">불러오는 중…</div>}
          {query.isError && <div className="banner error">구역 목록을 불러오지 못했습니다.</div>}

          {query.data && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>구역명</th>
                  <th>유형</th>
                  <th>중심 좌표</th>
                  <th>반경</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((zone) => (
                  <tr key={zone.zoneId}>
                    <td>{zone.zoneName}</td>
                    <td>{ZONE_TYPE_LABEL[zone.zoneType] ?? zone.zoneType}</td>
                    <td>
                      {zone.centerLatitude.toFixed(4)}, {zone.centerLongitude.toFixed(4)}
                    </td>
                    <td>{zone.radiusKm}km</td>
                    <td>
                      <span className={`tag ${zone.active ? 'status-active' : 'status-inactive'}`}>
                        {zone.active ? '활성' : '비활성'}
                      </span>
                    </td>
                  </tr>
                ))}
                {query.data.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center' }}>
                      등록된 비행금지구역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

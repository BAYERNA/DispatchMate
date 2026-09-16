import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { AdminLayout } from '../components/AdminLayout'
import { Banner } from '../components/Banner'
import { ApiError } from '../api/client'
import { listAccounts } from '../api/accounts'
import {
  listDevices,
  registerDevice,
  relocateDevice,
  remapDevice,
  updateDeviceStreamUrl,
  type DeviceRegisterInput,
} from '../api/devices'
import type { DeviceType } from '../types'

const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  BODYCAM: '웨어러블카메라',
  SMARTPHONE: '스마트폰',
  DIGITAL_MASK: '디지털마스크',
  SENSOR: '센서',
  CCTV: 'CCTV',
  DRONE: '드론',
}
const PERSONAL_TYPES: DeviceType[] = ['BODYCAM', 'SMARTPHONE', 'DIGITAL_MASK', 'SENSOR']
const FIXED_LOCATION_TYPES: DeviceType[] = ['CCTV', 'DRONE']
// DISPATCHED는 드론 전용(FR-25 자동배차 중) — WARNING/DISCONNECTED와 달리 이상 상태가 아니므로
// 경고색 대신 중립색으로 구분한다.
const DEVICE_STATUS_LABEL: Record<string, string> = {
  NORMAL: '정상',
  WARNING: '저전압',
  DISCONNECTED: '연결끊김',
  DISPATCHED: '배차중',
}

const EMPTY_FORM: DeviceRegisterInput = { deviceType: 'BODYCAM', serialNo: '', connectionType: 'BLE' }
const PAGE_SIZE = 50

// ADM-006 기기·장비 매핑 관리 (FR-11, NFR-05, FR-24 CCTV·드론 자산등록)
export function DeviceListPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [deviceType, setDeviceType] = useState('ALL')
  const [page, setPage] = useState(0)
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [form, setForm] = useState<DeviceRegisterInput>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [remapTargetId, setRemapTargetId] = useState<string | null>(null)
  const [remapUserId, setRemapUserId] = useState('')
  const [remapError, setRemapError] = useState<string | null>(null)
  const [relocateTargetId, setRelocateTargetId] = useState<string | null>(null)
  const [relocateLat, setRelocateLat] = useState('')
  const [relocateLng, setRelocateLng] = useState('')
  const [relocateError, setRelocateError] = useState<string | null>(null)
  const [streamUrlTargetId, setStreamUrlTargetId] = useState<string | null>(null)
  const [streamUrlInput, setStreamUrlInput] = useState('')
  const [streamUrlError, setStreamUrlError] = useState<string | null>(null)

  const devicesQuery = useQuery({
    queryKey: ['devices', keyword, deviceType, page],
    queryFn: () => listDevices({ keyword, deviceType, page, size: PAGE_SIZE }),
  })

  // 기기가 50대를 넘으면 뒤쪽 기기가 목록에서 아예 안 보이던 결함 — 검색/필터를 바꾸면
  // 이전 페이지 번호가 그대로 남아 빈 결과처럼 보이는 걸 막기 위해 1페이지로 되돌린다.
  function updateKeyword(value: string) {
    setKeyword(value)
    setPage(0)
  }

  function updateDeviceType(value: string) {
    setDeviceType(value)
    setPage(0)
  }
  const respondersQuery = useQuery({
    queryKey: ['accounts', '', 'RESPONDER', 'for-mapping'],
    queryFn: () => listAccounts({ role: 'RESPONDER', page: 0, size: 200 }),
  })

  const registerMutation = useMutation({
    mutationFn: (input: DeviceRegisterInput) => registerDevice(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setShowRegisterForm(false)
      setForm(EMPTY_FORM)
      setFormError(null)
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : '등록에 실패했습니다.'),
  })

  const remapMutation = useMutation({
    mutationFn: ({ deviceId, userId }: { deviceId: string; userId: string }) => remapDevice(deviceId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setRemapTargetId(null)
      setRemapError(null)
    },
    onError: (err) => setRemapError(err instanceof ApiError ? err.message : '매핑 변경에 실패했습니다.'),
  })

  // CCTV·드론은 등록 시 입력한 좌표를 이후에도 고쳐 넣을 방법이 없었다 — relocateDevice API는
  // 있었지만 어떤 화면에도 연결돼 있지 않았던 결함(전체 화면 점검 결과)의 재발 방지 지점.
  const relocateMutation = useMutation({
    mutationFn: ({ deviceId, latitude, longitude }: { deviceId: string; latitude: number; longitude: number }) =>
      relocateDevice(deviceId, latitude, longitude),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setRelocateTargetId(null)
      setRelocateError(null)
    },
    onError: (err) => setRelocateError(err instanceof ApiError ? err.message : '위치 수정에 실패했습니다.'),
  })

  // FR-24/26: CMD-002 라이브 카메라 뷰가 참조하는 스트림 주소. 등록 이후에도 여기서 고쳐 넣을 수 있어야
  // relocateMutation과 같은 "화면에 안 붙어있던" 결함을 반복하지 않는다.
  const streamUrlMutation = useMutation({
    mutationFn: ({ deviceId, streamUrl }: { deviceId: string; streamUrl: string }) =>
      updateDeviceStreamUrl(deviceId, streamUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setStreamUrlTargetId(null)
      setStreamUrlError(null)
    },
    onError: (err) => setStreamUrlError(err instanceof ApiError ? err.message : '스트림 주소 수정에 실패했습니다.'),
  })

  const isPersonal = PERSONAL_TYPES.includes(form.deviceType)
  const isFixed = FIXED_LOCATION_TYPES.includes(form.deviceType)

  function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    registerMutation.mutate(form)
  }

  function handleRemapSubmit(e: FormEvent, deviceId: string) {
    e.preventDefault()
    if (!remapUserId) return
    remapMutation.mutate({ deviceId, userId: remapUserId })
  }

  function handleRelocateSubmit(e: FormEvent, deviceId: string) {
    e.preventDefault()
    if (!relocateLat || !relocateLng) return
    relocateMutation.mutate({ deviceId, latitude: Number(relocateLat), longitude: Number(relocateLng) })
  }

  function handleStreamUrlSubmit(e: FormEvent, deviceId: string) {
    e.preventDefault()
    if (!streamUrlInput.trim()) return
    streamUrlMutation.mutate({ deviceId, streamUrl: streamUrlInput.trim() })
  }

  return (
    <AdminLayout screenId="ADM-006" title="기기·장비 매핑 관리">
      <div className="wf">
        <div className="wf-header">
          <span>기기 · 장비 매핑 관리</span>
          <button type="button" className="wf-btn primary small" onClick={() => setShowRegisterForm((v) => !v)}>
            + 신규 기기 등록
          </button>
        </div>
        <div className="wf-body">
          {showRegisterForm && (
            <form className="wf-box" style={{ marginBottom: 14 }} onSubmit={handleRegisterSubmit}>
              <div className="form-grid">
                <div>
                  <label className="field-label" htmlFor="deviceType">
                    기기 유형
                  </label>
                  <select
                    id="deviceType"
                    className="wf-field"
                    value={form.deviceType}
                    onChange={(e) => setForm((f) => ({ ...f, deviceType: e.target.value as DeviceType }))}
                  >
                    {Object.entries(DEVICE_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="serialNo">
                    시리얼 번호
                  </label>
                  <input
                    id="serialNo"
                    className="wf-field"
                    value={form.serialNo}
                    onChange={(e) => setForm((f) => ({ ...f, serialNo: e.target.value }))}
                    required
                  />
                </div>
                {isPersonal && (
                  <div>
                    <label className="field-label" htmlFor="mappedUser">
                      매핑 대원
                    </label>
                    <select
                      id="mappedUser"
                      className="wf-field"
                      value={form.currentUserId ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, currentUserId: e.target.value || undefined }))}
                    >
                      <option value="">미매핑</option>
                      {respondersQuery.data?.content.map((r) => (
                        <option key={r.userId} value={r.userId}>
                          {r.name} ({r.badgeNumber})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {isFixed && (
                  <>
                    <div>
                      <label className="field-label" htmlFor="latitude">
                        위도
                      </label>
                      <input
                        id="latitude"
                        type="number"
                        step="any"
                        className="wf-field"
                        value={form.latitude ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, latitude: Number(e.target.value) }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="longitude">
                        경도
                      </label>
                      <input
                        id="longitude"
                        type="number"
                        step="any"
                        className="wf-field"
                        value={form.longitude ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, longitude: Number(e.target.value) }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="streamUrl">
                        스트림 주소 (선택, 나중에 등록해도 됨)
                      </label>
                      <input
                        id="streamUrl"
                        className="wf-field"
                        placeholder="예: http://192.168.0.10:81/stream"
                        value={form.streamUrl ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, streamUrl: e.target.value || undefined }))}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="form-actions">
                <button type="button" className="wf-btn" onClick={() => setShowRegisterForm(false)}>
                  취소
                </button>
                <button type="submit" className="wf-btn primary" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? '등록 중…' : '등록'}
                </button>
              </div>
              {formError && <Banner kind="error" message={formError} />}
            </form>
          )}

          <div className="form-row">
            <div style={{ flex: 1 }}>
              <label className="field-label" htmlFor="deviceKeyword">
                검색
              </label>
              <input
                id="deviceKeyword"
                className="wf-field"
                placeholder="기기ID·매핑대원 검색"
                value={keyword}
                onChange={(e) => updateKeyword(e.target.value)}
              />
            </div>
            <div style={{ width: 160 }}>
              <label className="field-label" htmlFor="deviceTypeFilter">
                필터
              </label>
              <select id="deviceTypeFilter" className="wf-field" value={deviceType} onChange={(e) => updateDeviceType(e.target.value)}>
                <option value="ALL">전체 유형</option>
                {Object.entries(DEVICE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {devicesQuery.isLoading && <div className="spinner-text">불러오는 중…</div>}

          {devicesQuery.data && (
            <table className="wf-table">
              <thead>
                <tr>
                  <th>기기유형</th>
                  <th>시리얼</th>
                  <th>연결방식</th>
                  <th>매핑대원</th>
                  <th>소속팀</th>
                  <th>위치</th>
                  <th>스트림 주소</th>
                  <th>상태</th>
                  <th>배터리</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {devicesQuery.data.content.map((device) => (
                  <tr key={device.deviceId}>
                    <td>{DEVICE_TYPE_LABEL[device.deviceType]}</td>
                    <td>{device.serialNo}</td>
                    <td>{device.connectionType ?? '—'}</td>
                    <td>{device.mappedUserName ?? (PERSONAL_TYPES.includes(device.deviceType) ? '— (미매핑)' : '— (자산)')}</td>
                    <td>{device.mappedUserTeam ?? '—'}</td>
                    <td>
                      {device.latitude != null && device.longitude != null
                        ? `${device.latitude.toFixed(4)}, ${device.longitude.toFixed(4)}`
                        : '—'}
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {FIXED_LOCATION_TYPES.includes(device.deviceType) ? (device.streamUrl ?? '— (미등록)') : '—'}
                    </td>
                    <td
                      style={{
                        color:
                          device.status === 'WARNING' || device.status === 'DISCONNECTED'
                            ? 'var(--color-alert)'
                            : undefined,
                      }}
                    >
                      {DEVICE_STATUS_LABEL[device.status] ?? device.status}
                    </td>
                    <td>{device.batteryLevel != null ? `${device.batteryLevel}%` : '-'}</td>
                    <td>
                      {PERSONAL_TYPES.includes(device.deviceType) &&
                        (remapTargetId === device.deviceId ? (
                          <form style={{ display: 'flex', gap: 4 }} onSubmit={(e) => handleRemapSubmit(e, device.deviceId)}>
                            <select
                              className="wf-field"
                              style={{ padding: '4px 6px', fontSize: 11 }}
                              value={remapUserId}
                              onChange={(e) => setRemapUserId(e.target.value)}
                              autoFocus
                            >
                              <option value="">대원 선택</option>
                              {respondersQuery.data?.content.map((r) => (
                                <option key={r.userId} value={r.userId}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                            <button type="submit" className="wf-btn primary small" disabled={remapMutation.isPending}>
                              확인
                            </button>
                            <button type="button" className="wf-btn small" onClick={() => setRemapTargetId(null)}>
                              취소
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="wf-btn small"
                            onClick={() => {
                              setRemapTargetId(device.deviceId)
                              setRemapUserId(device.currentUserId ?? '')
                            }}
                          >
                            매핑 변경
                          </button>
                        ))}
                      {FIXED_LOCATION_TYPES.includes(device.deviceType) &&
                        (relocateTargetId === device.deviceId ? (
                          <form style={{ display: 'flex', gap: 4 }} onSubmit={(e) => handleRelocateSubmit(e, device.deviceId)}>
                            <input
                              className="wf-field"
                              style={{ padding: '4px 6px', fontSize: 11, width: 80 }}
                              type="number"
                              step="any"
                              placeholder="위도"
                              value={relocateLat}
                              onChange={(e) => setRelocateLat(e.target.value)}
                              autoFocus
                              required
                            />
                            <input
                              className="wf-field"
                              style={{ padding: '4px 6px', fontSize: 11, width: 80 }}
                              type="number"
                              step="any"
                              placeholder="경도"
                              value={relocateLng}
                              onChange={(e) => setRelocateLng(e.target.value)}
                              required
                            />
                            <button type="submit" className="wf-btn primary small" disabled={relocateMutation.isPending}>
                              확인
                            </button>
                            <button type="button" className="wf-btn small" onClick={() => setRelocateTargetId(null)}>
                              취소
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="wf-btn small"
                            onClick={() => {
                              setRelocateTargetId(device.deviceId)
                              setRelocateLat(device.latitude != null ? String(device.latitude) : '')
                              setRelocateLng(device.longitude != null ? String(device.longitude) : '')
                            }}
                          >
                            위치 수정
                          </button>
                        ))}
                      {FIXED_LOCATION_TYPES.includes(device.deviceType) &&
                        (streamUrlTargetId === device.deviceId ? (
                          <form
                            style={{ display: 'flex', gap: 4, marginTop: 4 }}
                            onSubmit={(e) => handleStreamUrlSubmit(e, device.deviceId)}
                          >
                            <input
                              className="wf-field"
                              style={{ padding: '4px 6px', fontSize: 11, width: 140 }}
                              placeholder="스트림 주소"
                              value={streamUrlInput}
                              onChange={(e) => setStreamUrlInput(e.target.value)}
                              autoFocus
                              required
                            />
                            <button type="submit" className="wf-btn primary small" disabled={streamUrlMutation.isPending}>
                              확인
                            </button>
                            <button type="button" className="wf-btn small" onClick={() => setStreamUrlTargetId(null)}>
                              취소
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="wf-btn small"
                            style={{ marginTop: 4 }}
                            onClick={() => {
                              setStreamUrlTargetId(device.deviceId)
                              setStreamUrlInput(device.streamUrl ?? '')
                            }}
                          >
                            스트림 주소 수정
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
                {devicesQuery.data.content.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center' }}>
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {devicesQuery.data && devicesQuery.data.totalElements > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <span className="alert-meta">
                전체 {devicesQuery.data.totalElements}대 · {devicesQuery.data.number + 1} / {devicesQuery.data.totalPages} 페이지
              </span>
              <button
                type="button"
                className="wf-btn small"
                disabled={devicesQuery.data.first}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </button>
              <button
                type="button"
                className="wf-btn small"
                disabled={devicesQuery.data.last}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </div>
          )}
          {remapError && <Banner kind="error" message={remapError} />}
          {relocateError && <Banner kind="error" message={relocateError} />}
          {streamUrlError && <Banner kind="error" message={streamUrlError} />}
        </div>
      </div>
    </AdminLayout>
  )
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import * as noFlyZonesApi from '../api/noFlyZones'
import { NoFlyZonesPage } from './NoFlyZonesPage'

vi.mock('../api/noFlyZones')

afterEach(cleanup)

const SUPER_ADMIN_USER = { userId: 'u1', name: '슈퍼관리자', role: 'SUPER_ADMIN' as const, initialPassword: false }

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <AuthContext.Provider
      value={{
        user: SUPER_ADMIN_USER,
        isAuthenticated: true,
        login: async () => {
          throw new Error('not used')
        },
        completeInitialPassword: () => {},
        logout: () => {},
      }}
    >
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NoFlyZonesPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>,
  )
}

// 비행 전 규제 체크 핵심 계약: 등록된 구역이 목록에 보이고, 새 구역을 등록하면 목록이 갱신된다.
describe('NoFlyZonesPage', () => {
  beforeEach(() => {
    vi.mocked(noFlyZonesApi.listNoFlyZones).mockResolvedValue([
      {
        zoneId: 'zone-1',
        zoneName: '예시 비행금지구역 A',
        zoneType: 'DEMO',
        centerLatitude: 37.4,
        centerLongitude: 127.1,
        radiusKm: 3,
        active: true,
      },
    ])
  })

  it('등록된 구역 목록을 불러와 보여준다', async () => {
    renderPage()
    expect(await screen.findByText('예시 비행금지구역 A')).toBeTruthy()
    expect(screen.getByText('3km')).toBeTruthy()
  })

  it('새 구역을 등록하면 목록을 다시 불러온다', async () => {
    vi.mocked(noFlyZonesApi.registerNoFlyZone).mockResolvedValue({
      zoneId: 'zone-2',
      zoneName: '테스트 비행장',
      zoneType: 'AIRPORT',
      centerLatitude: 35.1,
      centerLongitude: 129.0,
      radiusKm: 5,
      active: true,
    })
    renderPage()
    await screen.findByText('예시 비행금지구역 A')

    fireEvent.change(screen.getByLabelText('구역명'), { target: { value: '테스트 비행장' } })
    fireEvent.change(screen.getByLabelText('구역 유형'), { target: { value: 'AIRPORT' } })
    fireEvent.change(screen.getByLabelText('중심 위도'), { target: { value: '35.1' } })
    fireEvent.change(screen.getByLabelText('중심 경도'), { target: { value: '129.0' } })
    fireEvent.change(screen.getByLabelText('반경 (km)'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: '구역 등록' }))

    await waitFor(() =>
      expect(noFlyZonesApi.registerNoFlyZone).toHaveBeenCalledWith({
        zoneName: '테스트 비행장',
        zoneType: 'AIRPORT',
        centerLatitude: 35.1,
        centerLongitude: 129.0,
        radiusKm: 5,
      }),
    )
    await waitFor(() => expect(noFlyZonesApi.listNoFlyZones).toHaveBeenCalledTimes(2))
  })

  it('등록 실패 시 에러 배너를 보여준다', async () => {
    const { ApiError } = await import('../api/client')
    vi.mocked(noFlyZonesApi.registerNoFlyZone).mockRejectedValue(
      new ApiError(400, { code: 'E400_01', message: '반경(km)은 0보다 커야 합니다.', timestamp: '', fieldErrors: [] }),
    )
    renderPage()
    await screen.findByText('예시 비행금지구역 A')

    fireEvent.change(screen.getByLabelText('구역명'), { target: { value: '잘못된 구역' } })
    fireEvent.click(screen.getByRole('button', { name: '구역 등록' }))

    expect(await screen.findByText('반경(km)은 0보다 커야 합니다.')).toBeTruthy()
  })
})

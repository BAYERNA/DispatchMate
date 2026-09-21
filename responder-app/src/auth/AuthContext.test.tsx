import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '../api/auth'
import { getStoredToken } from '../api/client'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'

vi.mock('../api/auth')

// CMN-001/002 로그인 세션의 핵심 계약: 로그인 성공 시 토큰·사용자 정보가 같이 영속화되고,
// 로그아웃/최초 비밀번호 변경 시 그 상태가 정확히 갱신되는지 검증한다.
describe('AuthContext', () => {
  beforeEach(() => localStorage.clear())

  function renderAuth() {
    return renderHook(() => useAuth(), { wrapper: AuthProvider })
  }

  it('저장된 토큰이 없으면 인증되지 않은 상태로 시작한다', () => {
    const { result } = renderAuth()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('login이 성공하면 토큰과 사용자 정보가 저장되고 인증 상태가 된다', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'issued-token',
      userId: 'user-1',
      name: '홍길동',
      role: 'RESPONDER',
      initialPassword: true,
    })
    const { result } = renderAuth()

    await act(async () => {
      await result.current.login('B0001', 'pw')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toMatchObject({ userId: 'user-1', role: 'RESPONDER', initialPassword: true })
    expect(getStoredToken()).toBe('issued-token')
    expect(JSON.parse(localStorage.getItem('faind.user')!)).toMatchObject({ userId: 'user-1' })
  })

  it('completeInitialPassword는 initialPassword만 false로 바꾸고 나머지는 유지한다', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'issued-token',
      userId: 'user-1',
      name: '홍길동',
      role: 'RESPONDER',
      initialPassword: true,
    })
    const { result } = renderAuth()
    await act(async () => {
      await result.current.login('B0001', 'pw')
    })

    act(() => result.current.completeInitialPassword())

    expect(result.current.user?.initialPassword).toBe(false)
    expect(result.current.user?.userId).toBe('user-1')
    expect(JSON.parse(localStorage.getItem('faind.user')!).initialPassword).toBe(false)
  })

  it('logout은 토큰·사용자 정보를 모두 지운다', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'issued-token',
      userId: 'user-1',
      name: '홍길동',
      role: 'RESPONDER',
      initialPassword: false,
    })
    const { result } = renderAuth()
    await act(async () => {
      await result.current.login('B0001', 'pw')
    })

    act(() => result.current.logout())

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(getStoredToken()).toBeNull()
    expect(localStorage.getItem('faind.user')).toBeNull()
  })

  it('AuthProvider 밖에서 useAuth를 쓰면 에러를 던진다', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.')
  })

  it('로그인 응답의 role이 3종을 벗어나면 인증 상태로 만들지 않고 던진다', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      accessToken: 'issued-token',
      userId: 'user-1',
      name: '홍길동',
      // @ts-expect-error 잘못된 백엔드 응답을 흉내낸다
      role: 'SUPERUSER',
      initialPassword: false,
    })
    const { result } = renderAuth()

    await expect(act(async () => result.current.login('B0001', 'pw'))).rejects.toThrow()

    expect(result.current.isAuthenticated).toBe(false)
    expect(getStoredToken()).toBeNull()
  })

  it('localStorage에 저장된 사용자 정보가 스키마에 맞지 않으면 로그아웃 상태로 시작한다', () => {
    localStorage.setItem('faind.accessToken', 'stale-token')
    localStorage.setItem('faind.user', JSON.stringify({ userId: 'user-1', name: '홍길동', role: 'SUPERUSER', initialPassword: false }))

    const { result } = renderAuth()

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })
})

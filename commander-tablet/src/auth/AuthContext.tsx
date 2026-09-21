import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react'
import { getStoredToken, setStoredToken } from '../api/client'
import * as authApi from '../api/auth'
import { authUserSchema, loginResponseSchema } from './schema'

type AuthUser = ReturnType<typeof authUserSchema.parse>

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (badgeNumber: string, password: string) => Promise<AuthUser>
  completeInitialPassword: () => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const USER_STORAGE_KEY = 'faind.user'

function loadStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) return null
  try {
    return authUserSchema.parse(JSON.parse(raw))
  } catch {
    // 파싱 실패뿐 아니라 스키마가 바뀐 구버전 저장값도 여기서 걸러진다 — 잘못된 role을
    // 신뢰하고 쓰는 것보다 로그아웃 상태로 시작하는 편이 안전하다.
    return null
  }
}

function persistUser(user: AuthUser | null): void {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_STORAGE_KEY)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => (getStoredToken() ? loadStoredUser() : null))

  const login = useCallback(async (badgeNumber: string, password: string) => {
    // 응답 형태를 타입 단언이 아니라 실제로 검증한다 — role이 예상 3종을 벗어나면 여기서
    // 던져서(로그인 실패로 처리) 잘못된 권한으로 화면이 뜨는 걸 막는다.
    const response = loginResponseSchema.parse(await authApi.login(badgeNumber, password))
    setStoredToken(response.accessToken)
    const nextUser: AuthUser = {
      userId: response.userId,
      name: response.name,
      role: response.role,
      initialPassword: response.initialPassword,
    }
    persistUser(nextUser)
    setUser(nextUser)
    return nextUser
  }, [])

  const completeInitialPassword = useCallback(() => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, initialPassword: false }
      persistUser(next)
      return next
    })
  }, [])

  const logout = useCallback(() => {
    setStoredToken(null)
    persistUser(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, completeInitialPassword, logout }),
    [user, login, completeInitialPassword, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

import type { ApiErrorBody } from '../types'

// NFR-02: "저장/제출 액션은 서버 응답(200) 확인 후에만 성공 피드백 표시, 실패 시 명시적 에러 메시지" —
// admin-web과 동일한 원칙. 모든 API 호출은 성공/실패를 명시적으로 구분해서 반환하고, 실패는 항상
// 사람이 읽을 수 있는 message를 담은 ApiError로 던진다.
export class ApiError extends Error {
  readonly status: number
  readonly body: ApiErrorBody | null

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.message ?? `요청이 실패했습니다 (HTTP ${status})`)
    this.status = status
    this.body = body
  }
}

const TOKEN_STORAGE_KEY = 'faind.accessToken'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.pathname + url.search
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getStoredToken()
  const response = await fetch(buildUrl(path, options.query), {
    signal: AbortSignal.timeout(15000),
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    throw new ApiError(response.status, data as ApiErrorBody)
  }

  return data as T
}

// backend(Java, /api/v1/*) 호출
export function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, options)
}

// notification-server 호출. dev server의 vite.config.ts가 /notify → notification-server(prefix 없음)로 프록시한다.
export function notifyRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(`/notify${path}`, options)
}

// ai-server 호출. vite.config.ts가 /ai-stream → ai-server(/api/v1/streams)로 프록시한다.
export function aiStreamRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(`/ai-stream${path}`, options)
}

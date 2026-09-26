import { apiRequest } from './client'
import type { AccountCreatedResponse, AccountResponse, Page } from '../types'

export interface AccountListParams {
  keyword?: string
  role?: string
  page?: number
  size?: number
  // ADM-002 계정 목록만 true로 넘긴다 — 기기 매핑 대상 선택 등 "활성 대원만 골라야 하는" 다른
  // 호출부는 기본값(false)을 그대로 써서 비활성 계정이 선택지에 섞이지 않게 한다.
  includeInactive?: boolean
}

// NFR-05: 검색·필터가 실제 쿼리 파라미터로 나가는지가 이 함수의 존재 이유 (ADM-002 QA 재검증 대상).
export function listAccounts(params: AccountListParams): Promise<Page<AccountResponse>> {
  return apiRequest<Page<AccountResponse>>('/api/v1/accounts', {
    query: {
      keyword: params.keyword,
      role: params.role,
      page: params.page,
      size: params.size,
      includeInactive: params.includeInactive ? 'true' : undefined,
    },
  })
}

export function getAccount(userId: string): Promise<AccountResponse> {
  return apiRequest<AccountResponse>(`/api/v1/accounts/${userId}`)
}

export interface AccountFormInput {
  name: string
  role: string
  badgeNumber?: string
  team?: string
  phone?: string
}

export function registerAccount(input: AccountFormInput): Promise<AccountCreatedResponse> {
  return apiRequest<AccountCreatedResponse>('/api/v1/accounts', { method: 'POST', body: input })
}

export function updateAccount(userId: string, input: AccountFormInput): Promise<AccountResponse> {
  return apiRequest<AccountResponse>(`/api/v1/accounts/${userId}`, { method: 'PUT', body: input })
}

export function reissuePassword(userId: string): Promise<AccountCreatedResponse> {
  return apiRequest<AccountCreatedResponse>(`/api/v1/accounts/${userId}/password/reissue`, { method: 'PATCH' })
}

export function deactivateAccount(userId: string): Promise<void> {
  return apiRequest<void>(`/api/v1/accounts/${userId}`, { method: 'DELETE' })
}

export function reactivateAccount(userId: string): Promise<void> {
  return apiRequest<void>(`/api/v1/accounts/${userId}/reactivate`, { method: 'PATCH' })
}

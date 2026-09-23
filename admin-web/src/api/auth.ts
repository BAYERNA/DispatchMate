import { apiRequest } from './client'
import type { LoginResponse } from '../types'

// CMN-001: 기관선택은 데모 스코프에서 단일 기관("기본 조직", V17 백필 코드 DEFAULT)으로
// 고정되어 있다(LoginPage의 disabled select 참고) — 멀티테넌시 1단계로 로그인 API가
// organizationCode를 요구하게 되어도, 화면·호출부 시그니처는 바꾸지 않고 여기서만 채운다.
const DEMO_ORGANIZATION_CODE = 'DEFAULT'

export function login(badgeNumber: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: { organizationCode: DEMO_ORGANIZATION_CODE, badgeNumber, password },
  })
}

export function setInitialPassword(newPassword: string, newPasswordConfirm: string): Promise<void> {
  return apiRequest<void>('/api/v1/auth/password/initial', {
    method: 'PATCH',
    body: { newPassword, newPasswordConfirm },
  })
}

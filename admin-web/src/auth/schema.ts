import { z } from 'zod'

// 로그인 응답을 role 필드까지 신뢰하고 그대로 저장·라우팅에 쓴다 — 백엔드가 예상과 다른 값을
// 주면(배포 불일치, API 버전 어긋남 등) 화면이 조용히 잘못된 권한으로 동작할 수 있다.
// localStorage에서 복원하는 값도 같은 스키마로 검증한다 — 앱 스키마가 바뀐 뒤 남아있는
// 구버전 저장값을 타입만 믿고 그대로 쓰지 않기 위함.
export const authUserSchema = z.object({
  userId: z.string(),
  name: z.string(),
  role: z.enum(['ADMIN', 'COMMANDER', 'RESPONDER']),
  initialPassword: z.boolean(),
})

export const loginResponseSchema = authUserSchema.extend({
  accessToken: z.string(),
})

export interface AuthenticatedUser {
  userId: string;
  badgeNumber: string;
  role: 'ADMIN' | 'COMMANDER' | 'RESPONDER';
  // 멀티테넌시 1단계(V17): JWT 자체에는 담지 않는다(backend와 동일 원칙 — 폐기된 세션·변경된
  // 소속을 즉시 반영하기 위해 매 요청마다 backend /auth/session에서 다시 읽는다).
  organizationId: string;
}

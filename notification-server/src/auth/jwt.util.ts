import * as jwt from 'jsonwebtoken';
import { AuthenticatedUser } from './authenticated-user.interface';

// backend(Java)의 JwtTokenProvider가 발급한 토큰을 그대로 검증한다 — Node가 로그인을 다시
// 구현하지 않고, 두 런타임이 같은 JWT_SECRET을 공유해 신뢰를 넘겨받는 구조 (기술스택 §4 요약표의
// "API 진입점: 인증·라우팅"을 게이트웨이가 아직 없는 데모 단계에서 각 서비스가 직접 검증하는 방식).
// 멀티테넌시 1단계(V17): organizationId는 JWT 클레임에 없다(backend가 매 요청마다 DB에서 다시
// 읽는 것과 같은 이유) — 이 함수는 서명·클레임만 검증하고, organizationId는 SessionService가
// backend /auth/session 응답에서 채워 넣는다.
export function verifyFaindJwt(token: string, secret: string): Omit<AuthenticatedUser, 'organizationId'> {
  const payload = jwt.verify(token, secret, { algorithms: ['HS512'] }) as jwt.JwtPayload;
  if (!payload.sub || !payload.role) {
    throw new Error('토큰에 필수 클레임(sub, role)이 없습니다.');
  }
  return {
    userId: payload.sub,
    badgeNumber: (payload.badgeNumber as string) ?? '',
    role: payload.role as AuthenticatedUser['role'],
  };
}

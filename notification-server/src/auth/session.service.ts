import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from './authenticated-user.interface';
import { verifyFaindJwt } from './jwt.util';

@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    let user: Omit<AuthenticatedUser, 'organizationId'>;
    try { user = verifyFaindJwt(token, this.config.getOrThrow<string>('JWT_SECRET')); }
    catch { throw new UnauthorizedException('유효하지 않은 토큰입니다.'); }
    const base = this.config.get<string>('BACKEND_BASE_URL', 'http://localhost:8080');
    let response: Response;
    try {
      response = await fetch(`${base}/api/v1/auth/session`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000), redirect: 'error',
      });
    } catch { throw new ServiceUnavailableException('계정 상태를 확인할 수 없습니다.'); }
    if (!response.ok) throw new UnauthorizedException('세션이 만료되었거나 폐기되었습니다.');
    const current = await response.json() as AuthenticatedUser;
    if (current.userId !== user.userId || current.role !== user.role || !current.organizationId) {
      throw new UnauthorizedException();
    }
    // organizationId는 JWT가 아니라 backend가 지금 막 다시 읽은 값을 신뢰 근거로 쓴다(위조 불가,
    // 즉시 반영) — user(JWT 디코딩 결과)에 그대로 병합한다.
    return { ...user, organizationId: current.organizationId };
  }
}

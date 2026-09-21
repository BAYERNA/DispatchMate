import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from './authenticated-user.interface';
import { verifyFaindJwt } from './jwt.util';

@Injectable()
export class SessionService {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<AuthenticatedUser> {
    let user: AuthenticatedUser;
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
    if (current.userId !== user.userId || current.role !== user.role) throw new UnauthorizedException();
    return user;
  }
}

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from './session.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }
    const token = header.substring('Bearer '.length);
    // Preserve 503 for backend outages, rather than falsely labelling the user's token invalid.
    (request as Request & { user?: unknown }).user = await this.sessions.verify(token);
    return true;
  }
}

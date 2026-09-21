import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

// backend(Java)의 NotificationHttpAdapter가 호출하는 인바운드 웹훅 전용 가드.
// 로그인 사용자 JWT가 아니라 두 서비스만 공유하는 내부 토큰으로 검증한다.
// Missing configuration fails closed, including local deployments.
@Injectable()
export class InternalWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.configService.get<string>('INTERNAL_WEBHOOK_TOKEN');
    if (!expectedToken) {
      throw new ServiceUnavailableException('내부 웹훅 토큰이 설정되지 않았습니다.');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.substring('Bearer '.length) : undefined;
    if (token !== expectedToken) {
      throw new UnauthorizedException('내부 웹훅 토큰이 유효하지 않습니다.');
    }
    return true;
  }
}

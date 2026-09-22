import './tracing';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// FAIND 알림 서비스 (기술스택 §2.3: 비동기 I/O에 강한 Node.js — WebSocket 기반 실시간
// 알림·인수인계 전파에 사용). FR-06, FR-18, FR-22, FR-23 담당.
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:8080')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`FAIND notification-server listening on :${port}`);
}

bootstrap();

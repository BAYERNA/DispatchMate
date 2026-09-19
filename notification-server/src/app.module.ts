import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AckModule } from './acknowledgements/ack.module';
import { AlertsModule } from './alerts/alerts.module';
import { EscalationModule } from './escalation/escalation.module';
import { WebhookModule } from './common/webhook/webhook.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { OperationsModule } from './operations/operations.module';
import { MissionModule } from './mission/mission.module';
import { AdvancedOperationsModule } from './advanced-operations/advanced-operations.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'faind'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME', 'faind'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        // backend(Java)의 Flyway가 스키마를 소유한다 — Node는 절대 스키마를 동기화/변경하지 않는다.
        synchronize: false,
      }),
    }),
    AlertsModule,
    AckModule,
    WebhookModule,
    EscalationModule,
    OperationsModule,
    MissionModule,
    AdvancedOperationsModule,
  ],
})
export class AppModule {}

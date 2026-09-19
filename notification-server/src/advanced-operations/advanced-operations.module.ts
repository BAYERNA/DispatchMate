import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from '../alerts/alerts.module';
import { Alert } from '../alerts/entities/alert.entity';
import { AdvancedOperationsController } from './advanced-operations.controller';
import { AdvancedOperationsService } from './advanced-operations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alert]), AlertsModule],
  controllers: [AdvancedOperationsController],
  providers: [AdvancedOperationsService],
  exports: [AdvancedOperationsService],
})
export class AdvancedOperationsModule {}

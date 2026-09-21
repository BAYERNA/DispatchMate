import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { AlertsModule } from '../alerts/alerts.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
@Module({imports:[TypeOrmModule.forFeature([Alert]),AlertsModule],controllers:[OperationsController],providers:[OperationsService]})
export class OperationsModule {}

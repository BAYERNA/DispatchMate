import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { AlertsModule } from '../alerts/alerts.module';
import { OrganizationScopeModule } from '../common/organization-scope/organization-scope.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
@Module({imports:[TypeOrmModule.forFeature([Alert]),AlertsModule,OrganizationScopeModule],controllers:[OperationsController],providers:[OperationsService]})
export class OperationsModule {}

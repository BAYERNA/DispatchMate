import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsController } from './alerts.controller';
import { AlertsGateway } from './alerts.gateway';
import { AlertsService } from './alerts.service';
import { Alert } from './entities/alert.entity';
import { IncidentAssignment } from './entities/incident-assignment.entity';
import { IncidentAccessService } from './incident-access.service';
import { IncidentAccessGuard } from './incident-access.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Alert, IncidentAssignment])],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsGateway, IncidentAccessService, IncidentAccessGuard],
  exports: [AlertsService, AlertsGateway, IncidentAccessService, IncidentAccessGuard],
})
export class AlertsModule {}

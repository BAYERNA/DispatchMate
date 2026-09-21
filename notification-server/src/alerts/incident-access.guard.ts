import { CanActivate, ExecutionContext, Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { IncidentAccessService } from './incident-access.service';
import { Alert } from './entities/alert.entity';

@Injectable()
export class IncidentAccessGuard implements CanActivate {
  constructor(private readonly access: IncidentAccessService,
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    let incidentId = request.params.incidentId;
    if (!incidentId) {
      if (!isUUID(request.params.alertId ?? '')) throw new BadRequestException('잘못된 알림 ID');
      const alert = await this.alerts.findOne({ where: { alertId: request.params.alertId } });
      if (!alert) throw new NotFoundException();
      if (request.user.role === 'RESPONDER' && alert.targetUserId && alert.targetUserId !== request.user.userId) {
        throw new ForbiddenException();
      }
      incidentId = alert.incidentId;
    }
    if (!isUUID(incidentId)) throw new BadRequestException('잘못된 출동 ID');
    const action = request.method === 'POST' ? request.path.split('/').pop() : 'read';
    await this.access.require(request.user, incidentId, action);
    return true;
  }
}

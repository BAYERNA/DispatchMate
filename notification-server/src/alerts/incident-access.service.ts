import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentAssignment } from './entities/incident-assignment.entity';
import { Incident } from './entities/incident.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';

@Injectable()
export class IncidentAccessService {
  constructor(
    @InjectRepository(IncidentAssignment) private readonly assignments: Repository<IncidentAssignment>,
    @InjectRepository(Incident) private readonly incidents: Repository<Incident>,
  ) {}

  // alerts 흐름(list/entry-info/supply-request/risk-warning/ai-risk-warning) 전체가 이 메서드
  // 하나를 거치므로(IncidentAccessGuard가 컨트롤러 레벨에서 강제), 다른 조직의 incident_id를
  // 추측한 접근을 여기서 한 번에 차단한다(멀티테넌시 1단계).
  async require(user: AuthenticatedUser, incidentId: string, action = 'read'): Promise<void> {
    if (!user || !['ADMIN', 'COMMANDER', 'RESPONDER'].includes(user.role)) throw new ForbiddenException();
    const incident = await this.incidents.findOne({ where: { incidentId } });
    if (!incident) throw new NotFoundException();
    if (incident.organizationId !== user.organizationId) throw new NotFoundException();
    if (action === 'ai-risk-warning') {
      if (!['ADMIN', 'COMMANDER'].includes(user.role)) throw new ForbiddenException();
      return;
    }
    if (action !== 'entry-info' && user.role !== 'RESPONDER') return;
    const assignment = await this.assignments.findOne({ where: { incidentId, userId: user.userId } });
    if (!assignment || (action === 'entry-info' && (user.role !== 'RESPONDER' || !assignment.isCommsLead))) {
      throw new ForbiddenException('배정 및 통신담당 권한을 확인하세요.');
    }
  }
}

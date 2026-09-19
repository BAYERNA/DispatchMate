import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentAssignment } from './entities/incident-assignment.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';

@Injectable()
export class IncidentAccessService {
  constructor(@InjectRepository(IncidentAssignment) private readonly assignments: Repository<IncidentAssignment>) {}

  async require(user: AuthenticatedUser, incidentId: string, action = 'read'): Promise<void> {
    if (!user || !['ADMIN', 'COMMANDER', 'RESPONDER'].includes(user.role)) throw new ForbiddenException();
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

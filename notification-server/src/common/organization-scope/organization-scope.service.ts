import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../../alerts/entities/incident.entity';
import { AuthenticatedUser } from '../../auth/authenticated-user.interface';

// 멀티테넌시 1단계(V17): alerts 밖의 governance/assurance/field-intelligence/mission/
// operations/advanced-operations 모듈들이 원시 SQL로 incident_id를 직접 받는 지점마다 이
// 서비스 하나를 재사용한다 — IncidentAccessService가 alerts 흐름 전체를 지키는 것과 같은
// 이유로, 다른 조직의 incident_id를 추측한 호출을 여기서 막는다.
@Injectable()
export class OrganizationScopeService {
  constructor(@InjectRepository(Incident) private readonly incidents: Repository<Incident>) {}

  async assertIncident(user: AuthenticatedUser, incidentId: string): Promise<void> {
    const incident = await this.incidents.findOne({ where: { incidentId } });
    if (!incident || incident.organizationId !== user.organizationId) throw new NotFoundException();
  }
}

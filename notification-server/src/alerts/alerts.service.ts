import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsGateway } from './alerts.gateway';
import { CreateEntryInfoDto } from './dto/create-entry-info.dto';
import { CreateRiskWarningDto } from './dto/create-risk-warning.dto';
import { CreateSupplyRequestDto } from './dto/create-supply-request.dto';
import { Alert } from './entities/alert.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';

const ALERT_CREATED_EVENT = 'alert:created';

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly alertRepository: Repository<Alert>,
    private readonly gateway: AlertsGateway,
  ) {}

  async listByIncident(incidentId: string, user: AuthenticatedUser): Promise<Alert[]> {
    const alerts = await this.alertRepository.find({ where: { incidentId }, order: { sentAt: 'DESC' } });
    return alerts.filter(alert => user.role !== 'RESPONDER' || !alert.targetUserId || alert.targetUserId === user.userId);
  }

  // FR-18: IncidentAccessGuard validates assignment and comms-lead permission before creation.
  async createEntryInfo(incidentId: string, authorId: string, dto: CreateEntryInfoDto): Promise<Alert> {
    const alert = this.alertRepository.create({
      incidentId,
      authorId,
      alertType: 'ENTRY_INFO',
      infoCategory: dto.infoCategory,
      locationLabel: dto.locationLabel,
      statusTag: dto.statusTag,
      message: dto.message ?? null,
      sourceType: 'HUMAN',
      clientRequestId: dto.clientRequestId ?? null,
    });
    return this.saveUserAlert(alert, authorId, dto.clientRequestId);
  }

  // FR-23: 장비·인력 지원 요청
  async createSupplyRequest(incidentId: string, authorId: string, dto: CreateSupplyRequestDto): Promise<Alert> {
    const alert = this.alertRepository.create({
      incidentId,
      authorId,
      alertType: 'SUPPLY_REQUEST',
      requestedItems: dto.requestedItems,
      sourceType: 'HUMAN',
      clientRequestId: dto.clientRequestId ?? null,
    });
    return this.saveUserAlert(alert, authorId, dto.clientRequestId);
  }

  // FR-06: 사람이 직접 보내는 위험정보 알림
  async createRiskWarning(incidentId: string, authorId: string, dto: CreateRiskWarningDto): Promise<Alert> {
    if (dto.targetUserId) {
      const targets = await this.alertRepository.query(`SELECT 1 FROM incident_assignments a
        JOIN users u ON u.user_id = a.user_id WHERE a.incident_id = $1 AND a.user_id = $2
        AND u.role = 'RESPONDER' AND u.status = 'ACTIVE'`, [incidentId, dto.targetUserId]);
      if (!targets.length) throw new BadRequestException('현재 출동에 배정된 활성 대원을 선택하세요.');
    }
    const alert = this.alertRepository.create({
      incidentId,
      authorId,
      targetUserId: dto.targetUserId ?? null,
      alertType: 'RISK_WARNING',
      channel: dto.channel,
      message: dto.message,
      sourceType: 'HUMAN',
      clientRequestId: dto.clientRequestId ?? null,
    });
    return this.saveUserAlert(alert, authorId, dto.clientRequestId);
  }

  // common/webhook에서 호출 — backend(AI/시스템)가 author_id 없이 보내는 알림.
  async createFromSystem(params: {
    incidentId: string;
    alertType: Alert['alertType'];
    message: string;
    sourceType: Alert['sourceType'];
    escalationOf?: string;
    targetUserId?: string | null;
    automationKey?: string;
  }): Promise<Alert> {
    const alert = this.alertRepository.create({
      incidentId: params.incidentId,
      authorId: null,
      alertType: params.alertType,
      message: params.message,
      sourceType: params.sourceType,
      channel: 'TEXT',
      escalationOf: params.escalationOf ?? null,
      targetUserId: params.targetUserId ?? null,
      automationKey: params.automationKey ?? null,
    });
    try {
      return await this.saveAndBroadcast(alert);
    } catch (error) {
      // Unique source ID makes retry/crash recovery and multiple workers idempotent.
      if ((params.escalationOf || params.automationKey) && (error as { code?: string }).code === '23505') {
        const existing = params.automationKey
          ? await this.alertRepository.findOne({where:{automationKey:params.automationKey}})
          : await this.alertRepository.findOne({ where: { escalationOf: params.escalationOf } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async saveAndBroadcast(alert: Alert): Promise<Alert> {
    const saved = await this.alertRepository.save(alert);
    this.gateway.broadcastToIncident(saved.incidentId, ALERT_CREATED_EVENT, saved);
    return saved;
  }

  private async saveUserAlert(alert: Alert, authorId: string, clientRequestId?: string): Promise<Alert> {
    try { return await this.saveAndBroadcast(alert); }
    catch (error) {
      if (clientRequestId && (error as {code?:string}).code === '23505') {
        const existing=await this.alertRepository.findOne({where:{authorId,clientRequestId}});
        if (existing) return existing;
      }
      throw error;
    }
  }
}

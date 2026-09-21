import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsGateway } from '../alerts/alerts.gateway';
import { Alert } from '../alerts/entities/alert.entity';
import { FreshnessDto } from './dto/freshness.dto';
import { AlertAcknowledgement } from './entities/alert-acknowledgement.entity';

const ALERT_ACKNOWLEDGED_EVENT = 'alert:acknowledged';
const STALE_MINUTES_THRESHOLD = 10;

// FR-22: 최초 확인을 기록한다. 동일 사용자의 재시도는 기존 확인을 반환한다.
// 이전 버전이 저장한 재확인 이력은 보존한다.
@Injectable()
export class AckService {
  constructor(
    @InjectRepository(AlertAcknowledgement) private readonly ackRepository: Repository<AlertAcknowledgement>,
    @InjectRepository(Alert) private readonly alertRepository: Repository<Alert>,
    private readonly gateway: AlertsGateway,
  ) {}

  // USR-001 "확인했어요" 버튼
  async acknowledge(alertId: string, userId: string): Promise<AlertAcknowledgement> {
    const alert = await this.alertRepository.findOne({ where: { alertId } });
    if (!alert) {
      throw new NotFoundException('해당 알림을 찾을 수 없습니다.');
    }
    const ack = await this.ackRepository.manager.transaction(async manager => {
      // Serialize retries across tabs/workers without deleting historical confirmations.
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${alertId}:${userId}`]);
      const repository = manager.getRepository(AlertAcknowledgement);
      const existing = await repository.findOne({ where: { alertId, userId }, order: { acknowledgedAt: 'DESC' } });
      return existing ?? repository.save(repository.create({ alertId, userId }));
    });
    this.gateway.broadcastToIncident(alert.incidentId, ALERT_ACKNOWLEDGED_EVENT, {
      alertId,
      userId,
      acknowledgedAt: ack.acknowledgedAt,
      targetUserId: alert.targetUserId,
    });
    return ack;
  }

  // 확인자 목록과 확인 기록의 경과 시간을 제공한다.
  async getFreshness(alertId: string): Promise<FreshnessDto> {
    const acks = await this.ackRepository.find({ where: { alertId }, order: { acknowledgedAt: 'DESC' } });
    const lastAcknowledgedAt = acks[0]?.acknowledgedAt ?? null;
    const isStale = lastAcknowledgedAt
      ? Date.now() - lastAcknowledgedAt.getTime() > STALE_MINUTES_THRESHOLD * 60_000
      : true;
    return {
      alertId,
      acknowledgedUserIds: [...new Set(acks.map((a) => a.userId))],
      lastAcknowledgedAt: lastAcknowledgedAt ? lastAcknowledgedAt.toISOString() : null,
      staleMinutesThreshold: STALE_MINUTES_THRESHOLD,
      isStale,
    };
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThan, Repository } from 'typeorm'
import { AlertsService } from '../alerts/alerts.service'
import { Alert } from '../alerts/entities/alert.entity'
import { Incident } from '../alerts/entities/incident.entity'
import { AlertAcknowledgement } from '../acknowledgements/entities/alert-acknowledgement.entity'

const CHECK_INTERVAL_MS = 60_000
// ack.service.ts의 STALE_MINUTES_THRESHOLD와 같은 기준을 쓴다 — CMD-002가 "갱신 필요"라고
// 보여주는 바로 그 시점에 재알림도 나가야 화면 표시와 실제 행동이 어긋나지 않는다.
const STALE_MINUTES_THRESHOLD = 10

// Phase 7 FR-22: 위험경고(RISK_WARNING)를 아무도 확인하지 않은 채 일정 시간이 지나면 재알림을
// 한 번 발송한다. cron 라이브러리 없이 setInterval로 직접 구현했다 — 이 프로젝트 규모에서 필요한
// 건 "N분마다 훑어보기"뿐이라 새 의존성을 들일 이유가 없다.
@Injectable()
export class EscalationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EscalationService.name)
  private timer?: NodeJS.Timeout

  constructor(
    @InjectRepository(Alert) private readonly alertRepository: Repository<Alert>,
    @InjectRepository(AlertAcknowledgement) private readonly ackRepository: Repository<AlertAcknowledgement>,
    @InjectRepository(Incident) private readonly incidentRepository: Repository<Incident>,
    private readonly alertsService: AlertsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.checkAndEscalate().catch((err) => this.logger.error('에스컬레이션 점검 실패', err))
    }, CHECK_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async checkAndEscalate(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_MINUTES_THRESHOLD * 60_000)
    // escalatedAt이 NULL인 것만 본다 — 이미 한 번 재알림을 보낸 alert는 다시 대상이 되지 않는다
    // (무한 재알림 방지). 원본을 확인해도 escalatedAt은 그대로 남지만, 그 다음 조회에서 acks가
    // 잡히므로 이미 걸러진다.
    const candidates = await this.alertRepository.find({
      where: { alertType: 'RISK_WARNING', escalatedAt: IsNull(), escalationOf: IsNull(), sentAt: LessThan(cutoff) },
    })
    if (candidates.length === 0) return

    const acks = await this.ackRepository.find({ where: { alertId: In(candidates.map((c) => c.alertId)) } })
    const ackedAlertIds = new Set(acks.map((a) => a.alertId))
    const unacked = candidates.filter((c) => !ackedAlertIds.has(c.alertId))
    if (unacked.length === 0) return

    const incidents = await this.incidentRepository.find({
      where: { incidentId: In([...new Set(unacked.map((a) => a.incidentId))]) },
    })
    const openIncidentIds = new Set(incidents.filter((i) => i.status !== 'CLOSED').map((i) => i.incidentId))

    for (const alert of unacked) {
      // 종료된 출동의 알림은 재알림하지 않는다 — 이미 끝난 상황에 "확인 안 했다"고 다시 알리는 건
      // 소음일 뿐이다. escalatedAt은 남기지 않는다: 나중에 이 출동이 재개될 일은 없으므로.
      if (!openIncidentIds.has(alert.incidentId)) continue

      const elapsedMinutes = Math.round((Date.now() - alert.sentAt.getTime()) / 60_000)
      await this.alertsService.createFromSystem({
        incidentId: alert.incidentId,
        alertType: 'RISK_WARNING',
        message: `[재알림] ${alert.message ?? '위험정보'} — 발송 후 ${elapsedMinutes}분째 미확인입니다.`,
        sourceType: 'AI',
        escalationOf: alert.alertId,
        targetUserId: alert.targetUserId,
      })
      alert.escalatedAt = new Date()
      await this.alertRepository.save(alert)
      this.logger.warn(`위험정보 미확인 에스컬레이션 발송 (alertId=${alert.alertId}, incident=${alert.incidentId})`)
    }
  }
}

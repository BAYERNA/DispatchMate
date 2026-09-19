import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AlertsService } from '../alerts/alerts.service'
import { Alert } from '../alerts/entities/alert.entity'
import { Incident } from '../alerts/entities/incident.entity'
import { AlertAcknowledgement } from '../acknowledgements/entities/alert-acknowledgement.entity'
import { EscalationService } from './escalation.service'

// Phase 7 FR-22: "위험경고 미확인 시 재알림" 회귀 방지 테스트.
// setInterval을 직접 기다리지 않고, private checkAndEscalate()를 바로 호출해 로직만 검증한다.
describe('EscalationService', () => {
  let service: EscalationService
  let alertRepository: { find: jest.Mock; save: jest.Mock }
  let ackRepository: { find: jest.Mock }
  let incidentRepository: { find: jest.Mock }
  let alertsService: { createFromSystem: jest.Mock }

  function makeStaleAlert(overrides: Partial<Alert> = {}): Alert {
    return {
      alertId: 'alert-1',
      incidentId: 'incident-1',
      targetUserId: null,
      authorId: null,
      alertType: 'RISK_WARNING',
      infoCategory: null,
      locationLabel: null,
      statusTag: null,
      requestedItems: null,
      sourceType: 'HUMAN',
      channel: 'TEXT',
      message: '2층 붕괴 위험',
      sentAt: new Date(Date.now() - 11 * 60_000),
      escalatedAt: null,
      ...overrides,
    } as Alert
  }

  beforeEach(async () => {
    alertRepository = { find: jest.fn(), save: jest.fn() }
    ackRepository = { find: jest.fn() }
    incidentRepository = { find: jest.fn() }
    alertsService = { createFromSystem: jest.fn().mockResolvedValue(undefined) }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationService,
        { provide: getRepositoryToken(Alert), useValue: alertRepository },
        { provide: getRepositoryToken(AlertAcknowledgement), useValue: ackRepository },
        { provide: getRepositoryToken(Incident), useValue: incidentRepository },
        { provide: AlertsService, useValue: alertsService },
      ],
    }).compile()

    service = module.get(EscalationService)
  })

  afterEach(() => {
    // onModuleInit에서 setInterval을 걸었을 수 있으니, 테스트 프로세스가 안 끝나고 매달리지 않게 정리.
    service.onModuleDestroy()
  })

  it('미확인 후보가 없으면 아무것도 하지 않는다', async () => {
    alertRepository.find.mockResolvedValue([])

    await (service as any).checkAndEscalate()

    expect(alertsService.createFromSystem).not.toHaveBeenCalled()
    expect(alertRepository.save).not.toHaveBeenCalled()
  })

  it('이미 확인된 알림은 재알림하지 않는다', async () => {
    const alert = makeStaleAlert()
    alertRepository.find.mockResolvedValue([alert])
    ackRepository.find.mockResolvedValue([{ alertId: 'alert-1', userId: 'user-1' }])

    await (service as any).checkAndEscalate()

    expect(alertsService.createFromSystem).not.toHaveBeenCalled()
    expect(alertRepository.save).not.toHaveBeenCalled()
  })

  it('종료된(CLOSED) 출동의 미확인 알림은 재알림하지 않는다', async () => {
    const alert = makeStaleAlert()
    alertRepository.find.mockResolvedValue([alert])
    ackRepository.find.mockResolvedValue([])
    incidentRepository.find.mockResolvedValue([{ incidentId: 'incident-1', status: 'CLOSED' }])

    await (service as any).checkAndEscalate()

    expect(alertsService.createFromSystem).not.toHaveBeenCalled()
    expect(alertRepository.save).not.toHaveBeenCalled()
  })

  it('진행중인 출동의 미확인 알림은 AI 소스로 재알림하고 escalatedAt을 남긴다', async () => {
    const alert = makeStaleAlert()
    alertRepository.find.mockResolvedValue([alert])
    ackRepository.find.mockResolvedValue([])
    incidentRepository.find.mockResolvedValue([{ incidentId: 'incident-1', status: 'IN_PROGRESS' }])

    await (service as any).checkAndEscalate()

    expect(alertsService.createFromSystem).toHaveBeenCalledTimes(1)
    const call = alertsService.createFromSystem.mock.calls[0][0]
    expect(call.incidentId).toBe('incident-1')
    expect(call.alertType).toBe('RISK_WARNING')
    expect(call.sourceType).toBe('AI')
    expect(call.escalationOf).toBe('alert-1')
    expect(alertRepository.find.mock.calls[0][0].where.escalationOf).toBeDefined()
    expect(call.message).toContain('재알림')
    expect(call.message).toContain('2층 붕괴 위험')

    expect(alertRepository.save).toHaveBeenCalledTimes(1)
    expect(alertRepository.save.mock.calls[0][0].escalatedAt).toBeInstanceOf(Date)
  })
})

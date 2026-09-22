import { OperationsService } from './operations.service';

describe('OperationsService organization isolation', () => {
  const commander: any = { userId: 'u', role: 'COMMANDER', organizationId: 'org-1' };

  it('rejects reviewing AI judgment feedback for another organization\'s incident before writing anything', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([{ related_incident_id: 'incident-in-org-2' }]) };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new OperationsService(db, orgScope);

    await expect(service.feedback('judgment-1', commander, 'CORRECT')).rejects.toThrow();
    expect(orgScope.assertIncident).toHaveBeenCalledWith(commander, 'incident-in-org-2');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('allows feedback with no related incident without consulting organization scope', async () => {
    const db: any = { query: jest.fn() };
    db.query
      .mockResolvedValueOnce([{ related_incident_id: null }])
      .mockResolvedValueOnce([{ judgmentId: 'judgment-1', verdict: 'CORRECT' }]);
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new OperationsService(db, orgScope);

    await service.feedback('judgment-1', commander, 'CORRECT');
    expect(orgScope.assertIncident).not.toHaveBeenCalled();
  });

  it('scopes the training session list to the caller\'s own organization', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([]) };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new OperationsService(db, orgScope);

    await service.trainingList(commander);

    expect(db.query.mock.calls[0][1]).toEqual(['org-1']);
  });

  it('rejects acting on a training session created in another organization', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([{ organizationId: 'org-2' }]) };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new OperationsService(db, orgScope);

    await expect(service.trainingAction('training-1', commander, 'START')).rejects.toThrow();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects acting on a nonexistent training session', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([]) };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new OperationsService(db, orgScope);

    await expect(service.trainingAction('training-1', commander, 'START')).rejects.toThrow();
  });
});

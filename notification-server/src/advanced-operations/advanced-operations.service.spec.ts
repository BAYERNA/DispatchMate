import { AdvancedOperationsService } from './advanced-operations.service';

describe('AdvancedOperationsService organization isolation', () => {
  const commander: any = { userId: 'u', role: 'COMMANDER', organizationId: 'org-1' };

  it('rejects changing a MAYDAY signal status when it belongs to another organization\'s incident', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([{ incident_id: 'incident-in-org-2' }]) };
    const alerts: any = {};
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new AdvancedOperationsService(db, alerts, config, orgScope);

    await expect(service.maydayStatus('signal-1', commander, 'ACKNOWLEDGED')).rejects.toThrow();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects updating a tactical objective when it belongs to another organization\'s incident', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([{ incident_id: 'incident-in-org-2' }]) };
    const alerts: any = {};
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new AdvancedOperationsService(db, alerts, config, orgScope);

    await expect(service.objectiveStatus('objective-1', commander, 'COMPLETED')).rejects.toThrow();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

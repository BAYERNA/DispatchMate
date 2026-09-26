import { MissionService } from './mission.service';

describe('MissionService organization isolation', () => {
  const commander: any = { userId: 'u', role: 'COMMANDER', organizationId: 'org-1' };

  it('rejects changing a command status when the command belongs to another organization\'s incident', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([{ incident_id: 'incident-in-org-2' }]) };
    const alerts: any = {};
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new MissionService(db, alerts, config, orgScope);

    await expect(service.commandStatus('command-1', commander, 'COMPLETED')).rejects.toThrow();
    expect(orgScope.assertIncident).toHaveBeenCalledWith(commander, 'incident-in-org-2');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects approving a collaboration packet that belongs to another organization\'s incident', async () => {
    const db: any = { query: jest.fn().mockResolvedValueOnce([{ incident_id: 'incident-in-org-2' }]) };
    const alerts: any = {};
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new MissionService(db, alerts, config, orgScope);

    await expect(service.sharePacket('packet-1', commander)).rejects.toThrow();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

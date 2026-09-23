import { FieldIntelligenceService } from './field-intelligence.service';

describe('FieldIntelligenceService organization isolation', () => {
  const commander: any = { userId: 'u', role: 'COMMANDER', organizationId: 'org-1' };

  it('rejects recording an observation for another organization\'s incident before writing anything', async () => {
    const db: any = { query: jest.fn() };
    const config: any = { get: jest.fn() };
    const alerts: any = {};
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new FieldIntelligenceService(db, config, alerts, orgScope);

    await expect(
      service.observation('incident-in-org-2', commander, { dataType: 'WEATHER', sourceName: 'kma' }),
    ).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects analyzing a radio transcript that belongs to another organization', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([{ transcript_id: 't', incident_id: 'incident-in-org-2', transcript: 'mayday' }]) };
    const config: any = { get: jest.fn() };
    const alerts: any = {};
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new FieldIntelligenceService(db, config, alerts, orgScope);

    await expect(service.analyzeTranscript('t', commander)).rejects.toThrow();
    expect(orgScope.assertIncident).toHaveBeenCalledWith(commander, 'incident-in-org-2');
  });
});

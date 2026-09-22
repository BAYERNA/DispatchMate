import { GovernanceService } from './governance.service';

describe('GovernanceService organization isolation', () => {
  const admin: any = { userId: 'u', role: 'ADMIN', organizationId: 'org-1' };

  it('rejects forecasting resources for another organization\'s incident before writing anything', async () => {
    const db: any = { query: jest.fn() };
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new GovernanceService(db, config, orgScope);

    await expect(service.forecast('incident-in-org-2', admin, { horizonMinutes: 60 })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects issuing a public status token for another organization\'s incident before writing anything', async () => {
    const db: any = { query: jest.fn() };
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new GovernanceService(db, config, orgScope);

    await expect(service.createPublicToken('incident-in-org-2', admin, { audience: 'PUBLIC' })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
});

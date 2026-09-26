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

  it('scopes federation agency registration to the caller\'s own organization', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([{ agencyId: 'a', trustStatus: 'PENDING' }]) };
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new GovernanceService(db, config, orgScope);

    await service.agency(admin, { agencyCode: 'PARTNER-01', name: '인접소방서' });

    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('org-1');
  });

  it('rejects sharing an incident with an agency trusted by a different organization', async () => {
    // The agency lookup is itself scoped to the caller's organization, so a foreign agencyId
    // simply never matches — this proves the query includes that filter.
    const db: any = { query: jest.fn().mockResolvedValueOnce([]) };
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new GovernanceService(db, config, orgScope);

    await expect(service.share('incident-1', admin, { agencyId: 'agency-in-org-2' })).rejects.toThrow();
    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('organization_id=$2');
    expect(params).toEqual(['agency-in-org-2', 'org-1']);
  });

  it('scopes the federation directory in the dashboard to the caller\'s own organization', async () => {
    const db: any = {
      query: jest.fn().mockImplementation((query: string) =>
        Promise.resolve(query.includes('COUNT(*)') ? [{ count: 0 }] : []),
      ),
    };
    const config: any = { get: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new GovernanceService(db, config, orgScope);

    await service.dashboard(admin);

    const federationCall = db.query.mock.calls.find(([query]: [string]) => query.includes('FROM federation_agencies'));
    expect(federationCall[1]).toEqual(['org-1']);
  });
});

import { AssuranceService } from './assurance.service';

describe('AssuranceService organization isolation', () => {
  const admin: any = { userId: 'u', role: 'ADMIN', organizationId: 'org-1' };

  it('rejects a temporary access grant scoped to another organization\'s incident before writing anything', async () => {
    const db: any = { query: jest.fn() };
    const orgScope: any = { assertIncident: jest.fn().mockRejectedValue(new Error('cross-org')) };
    const service = new AssuranceService(db, orgScope);

    await expect(
      service.temporaryGrant(admin, { userId: 'target', permission: 'READ', reason: 'test', incidentId: 'incident-in-org-2' }),
    ).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('allows a temporary access grant with no incidentId without consulting organization scope', async () => {
    const db: any = { query: jest.fn().mockResolvedValue([{ grantId: 'g', expiresAt: new Date() }]) };
    const orgScope: any = { assertIncident: jest.fn() };
    const service = new AssuranceService(db, orgScope);

    await service.temporaryGrant(admin, { userId: 'target', permission: 'READ', reason: 'test' });
    expect(orgScope.assertIncident).not.toHaveBeenCalled();
  });
});

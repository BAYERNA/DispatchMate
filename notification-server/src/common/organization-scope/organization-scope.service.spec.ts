import { OrganizationScopeService } from './organization-scope.service';

describe('OrganizationScopeService', () => {
  let incidents: any, service: OrganizationScopeService;
  beforeEach(() => {
    incidents = { findOne: jest.fn() };
    service = new OrganizationScopeService(incidents);
  });

  it('rejects an incident belonging to another organization', async () => {
    incidents.findOne.mockResolvedValue({ incidentId: 'i', organizationId: 'org-2' });
    await expect(service.assertIncident({ organizationId: 'org-1' } as any, 'i')).rejects.toThrow();
  });

  it('rejects a nonexistent incident', async () => {
    incidents.findOne.mockResolvedValue(null);
    await expect(service.assertIncident({ organizationId: 'org-1' } as any, 'i')).rejects.toThrow();
  });

  it('allows an incident belonging to the same organization', async () => {
    incidents.findOne.mockResolvedValue({ incidentId: 'i', organizationId: 'org-1' });
    await expect(service.assertIncident({ organizationId: 'org-1' } as any, 'i')).resolves.toBeUndefined();
  });
});

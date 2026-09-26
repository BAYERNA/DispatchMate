import { IncidentAccessService } from './incident-access.service';
describe('IncidentAccessService', () => {
  let assignments: any, incidents: any, access: IncidentAccessService;
  const responder: any = { userId: 'u', role: 'RESPONDER', organizationId: 'org-1' };
  beforeEach(() => {
    assignments = { findOne: jest.fn() };
    incidents = { findOne: jest.fn().mockResolvedValue({ incidentId: 'i', organizationId: 'org-1' }) };
    access = new IncidentAccessService(assignments, incidents);
  });
  it('blocks unassigned reads, writes and acknowledgements', async () => {
    assignments.findOne.mockResolvedValue(null);
    for (const action of ['read','supply-request','risk-warning','acknowledgements']) {
      await expect(access.require(responder, 'i', action)).rejects.toThrow();
    }
  });
  it('allows assigned responders but only comms leads can post entry-info', async () => {
    assignments.findOne.mockResolvedValue({isCommsLead:false});
    await expect(access.require(responder,'i')).resolves.toBeUndefined();
    await expect(access.require(responder,'i','entry-info')).rejects.toThrow();
    assignments.findOne.mockResolvedValue({isCommsLead:true});
    await expect(access.require(responder,'i','entry-info')).resolves.toBeUndefined();
  });
  it('only commanders/admins may create AI warnings', async () => {
    await expect(access.require(responder,'i','ai-risk-warning')).rejects.toThrow();
    for (const role of ['ADMIN','COMMANDER']) await expect(access.require({...responder,role},'i','ai-risk-warning')).resolves.toBeUndefined();
  });
  it('blocks access to an incident belonging to another organization', async () => {
    incidents.findOne.mockResolvedValue({ incidentId: 'i', organizationId: 'org-2' });
    await expect(access.require(responder, 'i')).rejects.toThrow();
  });
  it('blocks access to a nonexistent incident', async () => {
    incidents.findOne.mockResolvedValue(null);
    await expect(access.require(responder, 'i')).rejects.toThrow();
  });
});

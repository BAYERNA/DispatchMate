import { IncidentAccessService } from './incident-access.service';
describe('IncidentAccessService', () => {
  let repo: any, access: IncidentAccessService;
  const responder: any = { userId: 'u', role: 'RESPONDER' };
  beforeEach(() => { repo = { findOne: jest.fn() }; access = new IncidentAccessService(repo); });
  it('blocks unassigned reads, writes and acknowledgements', async () => {
    repo.findOne.mockResolvedValue(null);
    for (const action of ['read','supply-request','risk-warning','acknowledgements']) {
      await expect(access.require(responder, 'i', action)).rejects.toThrow();
    }
  });
  it('allows assigned responders but only comms leads can post entry-info', async () => {
    repo.findOne.mockResolvedValue({isCommsLead:false});
    await expect(access.require(responder,'i')).resolves.toBeUndefined();
    await expect(access.require(responder,'i','entry-info')).rejects.toThrow();
    repo.findOne.mockResolvedValue({isCommsLead:true});
    await expect(access.require(responder,'i','entry-info')).resolves.toBeUndefined();
  });
  it('only commanders/admins may create AI warnings', async () => {
    await expect(access.require(responder,'i','ai-risk-warning')).rejects.toThrow();
    for (const role of ['ADMIN','COMMANDER']) await expect(access.require({...responder,role},'i','ai-risk-warning')).resolves.toBeUndefined();
  });
});

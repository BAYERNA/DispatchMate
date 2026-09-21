import { IncidentAccessGuard } from './incident-access.guard';
const incidentId='00000000-0000-4000-8000-000000000001';
const alertId='00000000-0000-4000-8000-000000000002';
describe('IncidentAccessGuard',()=>{
  it('resolves acknowledgement ownership through the actual alert',async()=>{
    const access={require:jest.fn().mockResolvedValue(undefined)};
    const alerts={findOne:jest.fn().mockResolvedValue({incidentId})};
    const guard=new IncidentAccessGuard(access as any,alerts as any);
    const request={params:{alertId},method:'POST',path:`/alerts/${alertId}/acknowledgements`,user:{userId:'u',role:'RESPONDER'}};
    await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>request})} as any)).resolves.toBe(true);
    expect(access.require).toHaveBeenCalledWith(request.user,incidentId,'acknowledgements');
  });
  it('does not bypass a denied assignment on REST',async()=>{
    const guard=new IncidentAccessGuard({require:jest.fn().mockRejectedValue(new Error('forbidden'))} as any,{} as any);
    const request={params:{incidentId},method:'GET',path:`/incidents/${incidentId}/alerts`,user:{userId:'u'}};
    await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>request})} as any)).rejects.toThrow('forbidden');
  });
});

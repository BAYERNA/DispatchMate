import { AlertsService } from './alerts.service';

describe('targeted alert visibility', () => {
  it('keeps private alerts out of another responder history and allows operator oversight', async () => {
    const alerts = [{alertId:'broadcast',targetUserId:null},{alertId:'mine',targetUserId:'a'},{alertId:'other',targetUserId:'b'}];
    const service = new AlertsService({find:async()=>alerts} as any, {} as any);
    expect((await service.listByIncident('incident',{userId:'a',badgeNumber:'a',role:'RESPONDER',organizationId:'org-1'})).map(alert=>alert.alertId)).toEqual(['broadcast','mine']);
    expect(await service.listByIncident('incident',{userId:'c',badgeNumber:'c',role:'COMMANDER',organizationId:'org-1'})).toEqual(alerts);
  });
  it('rejects a target who is not an active assigned responder before saving', async () => {
    const repository = {query:jest.fn().mockResolvedValue([]),save:jest.fn()};
    const service = new AlertsService(repository as any, {} as any);
    await expect(service.createRiskWarning('incident','author',{targetUserId:'other',channel:'TEXT',message:'risk'})).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('returns the existing command after an offline retry without broadcasting twice', async () => {
    const existing={alertId:'existing',authorId:'author',clientRequestId:'request'};
    const repository={create:(value:any)=>value,save:jest.fn().mockRejectedValue({code:'23505'}),findOne:jest.fn().mockResolvedValue(existing)};
    const gateway={broadcastToIncident:jest.fn()};
    const service=new AlertsService(repository as any,gateway as any);
    await expect(service.createSupplyRequest('incident','author',{clientRequestId:'request',requestedItems:[{item:'air',qty:1}]})).resolves.toBe(existing);
    expect(repository.findOne).toHaveBeenCalledWith({where:{authorId:'author',clientRequestId:'request'}});
    expect(gateway.broadcastToIncident).not.toHaveBeenCalled();
  });
});

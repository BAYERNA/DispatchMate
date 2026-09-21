import { AlertsService } from './alerts.service';
import { EscalationService } from '../escalation/escalation.service';
describe('escalation lifecycle', () => {
  it('does not escalate derived warnings in later polling cycles', async () => {
    jest.useFakeTimers();
    const rows: any[] = [{alertId:'original',incidentId:'i',alertType:'RISK_WARNING',message:'risk',sentAt:new Date(Date.now()-660000),escalatedAt:null,escalationOf:null}];
    const repo: any = {
      find: jest.fn(async ({where}) => rows.filter(r => !r.escalatedAt && (!where.escalationOf || !r.escalationOf) && Date.now()-r.sentAt.getTime()>600000)),
      create: (v: any) => ({...v,escalatedAt:null}),
      save: async (v: any) => {if(!v.alertId){v.alertId=`new-${rows.length}`;v.sentAt=new Date();rows.push(v)}return v},
    };
    const alerts = new AlertsService(repo,{broadcastToIncident:jest.fn()} as any);
    const escalation = new EscalationService(repo,{find:async()=>[]} as any,{find:async()=>[{incidentId:'i',status:'IN_PROGRESS'}]} as any,alerts);
    try {
      await (escalation as any).checkAndEscalate();
      expect(rows).toHaveLength(2);
      jest.advanceTimersByTime(660000);
      await (escalation as any).checkAndEscalate();
      expect(rows).toHaveLength(2);
    } finally { jest.useRealTimers(); }
  });
  it('deduplicates a retry after a unique-source conflict without rebroadcast', async () => {
    const existing={alertId:'existing'};
    const gateway={broadcastToIncident:jest.fn()};
    const repo={create:(x:any)=>x, save:jest.fn().mockRejectedValue({code:'23505'}),findOne:jest.fn().mockResolvedValue(existing)};
    const service=new AlertsService(repo as any,gateway as any);
    await expect(service.createFromSystem({incidentId:'i',alertType:'RISK_WARNING',sourceType:'AI',message:'risk',escalationOf:'source'})).resolves.toBe(existing);
    expect(gateway.broadcastToIncident).not.toHaveBeenCalled();
  });
});

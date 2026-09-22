import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AlertsModule } from './alerts.module';
import { AckModule } from '../acknowledgements/ack.module';
import { AuthModule } from '../auth/auth.module';
import { SessionService } from '../auth/session.service';
import { Alert } from './entities/alert.entity';
import { IncidentAssignment } from './entities/incident-assignment.entity';
import { Incident } from './entities/incident.entity';
import { AlertAcknowledgement } from '../acknowledgements/entities/alert-acknowledgement.entity';

describe('HTTP authorization wiring (real controllers and guards, mocked repositories)', () => {
  let app: INestApplication, base: string;
  const incidentId='00000000-0000-4000-8000-000000000001';
  const alertId='00000000-0000-4000-8000-000000000002';
  const organizationId='org-1';
  const assignments={findOne:jest.fn()};
  const query = jest.fn().mockResolvedValue([]);
  let role = 'RESPONDER';
  let targetUserId: string | null = null;
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[ConfigModule.forRoot({isGlobal:true}),AuthModule,AlertsModule,AckModule]})
      .overrideProvider(SessionService).useValue({verify:async()=>({userId:'u',role,organizationId})})
      .overrideProvider(getRepositoryToken(Alert)).useValue({query,find:async()=>[],findOne:async()=>({alertId,incidentId,targetUserId})})
      .overrideProvider(getRepositoryToken(IncidentAssignment)).useValue(assignments)
      .overrideProvider(getRepositoryToken(Incident)).useValue({findOne:async()=>({incidentId,organizationId})})
      .overrideProvider(getRepositoryToken(AlertAcknowledgement)).useValue({find:async()=>[]})
      .compile();
    app=module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
    await app.listen(0,'127.0.0.1');
    base=await app.getUrl();
  });
  afterAll(async()=>{if(app) await app.close()});
  beforeEach(()=>{role='RESPONDER';targetUserId=null;query.mockClear();});
  it('denies anonymous and unassigned incident reads',async()=>{
    assignments.findOne.mockResolvedValue(null);
    expect((await fetch(`${base}/incidents/${incidentId}/alerts`)).status).toBe(401);
    expect((await fetch(`${base}/incidents/${incidentId}/alerts`,{headers:{Authorization:'Bearer test'}})).status).toBe(403);
  });
  it('allows assigned reads but blocks spoofed AI warnings',async()=>{
    assignments.findOne.mockResolvedValue({isCommsLead:true});
    expect((await fetch(`${base}/incidents/${incidentId}/alerts`,{headers:{Authorization:'Bearer test'}})).status).toBe(200);
    expect((await fetch(`${base}/incidents/${incidentId}/alerts/ai-risk-warning`,{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:'{"message":"test"}'})).status).toBe(403);
  });
  it('enforces assignment on acknowledgement routes as well',async()=>{
    assignments.findOne.mockResolvedValue(null);
    expect((await fetch(`${base}/alerts/${alertId}/acknowledgements/freshness`,{headers:{Authorization:'Bearer test'}})).status).toBe(403);
  });
  it('records receipt only for the authenticated identity and validates batches', async()=>{
    assignments.findOne.mockResolvedValue({isCommsLead:false});
    const url=`${base}/incidents/${incidentId}/alerts/receipts`;
    const options={method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'}};
    expect((await fetch(url,{...options,body:JSON.stringify({alertIds:[alertId],userId:'victim'})})).status).toBe(201);
    expect(query.mock.calls[0][1]).toEqual([incidentId,'u',[alertId]]);
    for (const alertIds of [[],['invalid'],Array(201).fill(alertId)]) {
      expect((await fetch(url,{...options,body:JSON.stringify({alertIds})})).status).toBe(400);
    }
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('restricts delivery rosters to operators', async()=>{
    assignments.findOne.mockResolvedValue({});
    const url=`${base}/incidents/${incidentId}/alerts/delivery-status`;
    const headers={Authorization:'Bearer test'};
    expect((await fetch(url,{headers})).status).toBe(403);
    role='COMMANDER';
    expect((await fetch(url,{headers})).status).toBe(200);
  });
  it('blocks receipt after assignment removal and other recipients acknowledgement', async()=>{
    assignments.findOne.mockResolvedValue(null);
    expect((await fetch(`${base}/incidents/${incidentId}/alerts/receipts`,{
      method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({alertIds:[alertId]})
    })).status).toBe(403);
    assignments.findOne.mockResolvedValue({});
    targetUserId='another-user';
    expect((await fetch(`${base}/alerts/${alertId}/acknowledgements`,{method:'POST',headers:{Authorization:'Bearer test'}})).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});

import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { AlertsModule } from './alerts.module';
import { AckModule } from '../acknowledgements/ack.module';
import { AuthModule } from '../auth/auth.module';
import { SessionService } from '../auth/session.service';
import { Alert } from './entities/alert.entity';
import { IncidentAssignment } from './entities/incident-assignment.entity';
import { AlertAcknowledgement } from '../acknowledgements/entities/alert-acknowledgement.entity';

describe('HTTP authorization wiring (real controllers and guards, mocked repositories)', () => {
  let app: INestApplication, base: string;
  const incidentId='00000000-0000-4000-8000-000000000001';
  const alertId='00000000-0000-4000-8000-000000000002';
  const assignments={findOne:jest.fn()};
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[ConfigModule.forRoot({isGlobal:true}),AuthModule,AlertsModule,AckModule]})
      .overrideProvider(SessionService).useValue({verify:async()=>({userId:'u',role:'RESPONDER'})})
      .overrideProvider(getRepositoryToken(Alert)).useValue({find:async()=>[],findOne:async()=>({alertId,incidentId})})
      .overrideProvider(getRepositoryToken(IncidentAssignment)).useValue(assignments)
      .overrideProvider(getRepositoryToken(AlertAcknowledgement)).useValue({find:async()=>[]})
      .compile();
    app=module.createNestApplication();
    await app.listen(0,'127.0.0.1');
    base=await app.getUrl();
  });
  afterAll(async()=>{if(app) await app.close()});
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
});

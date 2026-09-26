import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hostname } from 'node:os';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { Alert } from '../alerts/entities/alert.entity';
import { AlertsService } from '../alerts/alerts.service';

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(AutomationService.name);
  private readonly workerId = `notification-${hostname()}-${process.pid}`;

  constructor(@InjectRepository(Alert) private readonly db: Repository<Alert>, private readonly alerts: AlertsService, private readonly config: ConfigService) {}
  onModuleInit() { void this.run(); this.timer = setInterval(() => void this.run(), 30_000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async run() {
    if (this.running) return;
    this.running = true;
    let lease: { fencingToken: number } | null = null;
    try {
      lease = await this.acquireLease();
      if (!lease) return;
      await this.safety(); await this.communicationSafety(); await this.commandAcknowledgementSafety(); await this.expirePar(); await this.repeatMaydays();
      await this.channels(); await this.processJobs(); await this.captureDrift(); await this.measureSlo();
    } catch (error) { this.logger.error('운영 자동화 점검 실패', error); }
    finally { if (lease) await this.releaseLease(lease.fencingToken).catch(error => this.logger.warn(`리스 해제 실패: ${error}`)); this.running = false; }
  }

  private async acquireLease() {
    const rows = await this.db.query(`INSERT INTO cluster_leases(lease_key,owner_id,expires_at) VALUES('automation:primary',$1,now()+interval '45 seconds') ON CONFLICT(lease_key) DO UPDATE SET owner_id=EXCLUDED.owner_id,fencing_token=cluster_leases.fencing_token+1,acquired_at=now(),heartbeat_at=now(),expires_at=EXCLUDED.expires_at WHERE cluster_leases.expires_at<now() OR cluster_leases.owner_id=EXCLUDED.owner_id RETURNING fencing_token AS "fencingToken"`, [this.workerId]);
    return rows[0] ?? null;
  }

  private releaseLease(fencingToken: number) { return this.db.query(`DELETE FROM cluster_leases WHERE lease_key='automation:primary' AND owner_id=$1 AND fencing_token=$2`, [this.workerId, fencingToken]); }

  private async safety() {
    const rows = await this.db.query(`SELECT DISTINCT ON(s.incident_id,s.user_id) s.incident_id AS "incidentId",s.user_id AS "userId",s.recorded_at AS "recordedAt",s.risk_level AS "riskLevel",s.connection_status AS "connectionStatus",s.biometric_data AS "biometricData",s.environment_data AS "environmentData" FROM responder_status_logs s JOIN incidents i ON i.incident_id=s.incident_id WHERE i.status<>'CLOSED' ORDER BY s.incident_id,s.user_id,s.recorded_at DESC`);
    for (const row of rows) {
      const rules: { code: string; message: string }[] = [];
      if (row.riskLevel === 'DANGER') rules.push({ code: 'RISK_DANGER', message: '대원 위험 상태 보고' });
      if (row.connectionStatus === 'DISCONNECTED') rules.push({ code: 'CONNECTION_LOST', message: '대원 통신 두절' });
      if (Number(row.biometricData?.heartRate) > 180) rules.push({ code: 'HEART_RATE_HIGH', message: '대원 심박수 180 초과' });
      if (Number(row.environmentData?.ambientTemperature) > 80) rules.push({ code: 'TEMPERATURE_HIGH', message: '주변 온도 80℃ 초과' });
      if (Date.now() - new Date(row.recordedAt).getTime() > 120_000) rules.push({ code: 'TELEMETRY_STALE', message: '대원 상태 신호 2분 이상 미수신' });
      for (const rule of rules) {
        const key = `safety:${row.incidentId}:${row.userId}:${rule.code}:${new Date(row.recordedAt).toISOString()}`;
        await this.alerts.createFromSystem({ incidentId: row.incidentId, alertType: 'RISK_WARNING', message: `[자동 안전 경보] ${rule.message}`, sourceType: 'SENSOR', targetUserId: row.userId, automationKey: key });
        await this.db.query(`INSERT INTO safety_alert_state(incident_id,user_id,rule_code,last_source_at) VALUES($1,$2,$3,$4) ON CONFLICT(incident_id,user_id,rule_code) DO UPDATE SET last_source_at=EXCLUDED.last_source_at,last_alerted_at=now()`, [row.incidentId, row.userId, rule.code, row.recordedAt]);
      }
    }
  }

  async communicationSafety() {
    const rows = await this.db.query(`SELECT a.incident_id AS "incidentId",a.user_id AS "userId",a.assigned_at AS "assignedAt",i.commander_id AS "commanderId",MAX(h.last_heartbeat_at) AS "lastHeartbeatAt"
      FROM incident_assignments a JOIN incidents i ON i.incident_id=a.incident_id JOIN users u ON u.user_id=a.user_id
      LEFT JOIN incident_communication_heartbeats h ON h.incident_id=a.incident_id AND h.user_id=a.user_id
      WHERE i.status<>'CLOSED' AND u.role='RESPONDER' AND u.status='ACTIVE'
      GROUP BY a.incident_id,a.user_id,a.assigned_at,i.commander_id HAVING (MAX(h.last_heartbeat_at) IS NULL AND a.assigned_at<now()-interval '45 seconds') OR MAX(h.last_heartbeat_at)<now()-interval '45 seconds'`);
    for (const row of rows) {
      const sourceAt = new Date(row.lastHeartbeatAt??row.assignedAt).toISOString();
      const neverReported = !row.lastHeartbeatAt;
      await this.alerts.createFromSystem({ incidentId: row.incidentId, alertType: 'RISK_WARNING', message: neverReported?'[통신 미연결] 배정 후 heartbeat가 수신되지 않음':'[통신 단절] 대원 heartbeat 45초 이상 미수신', sourceType: 'SENSOR', targetUserId: row.commanderId??row.userId, automationKey: `${neverReported?'communication-never':'communication-stale'}:${row.incidentId}:${row.userId}:${sourceAt}` });
      await this.db.query(`INSERT INTO safety_alert_state(incident_id,user_id,rule_code,last_source_at,resolved_at) VALUES($1,$2,'COMMUNICATION_HEARTBEAT_STALE',$3,NULL) ON CONFLICT(incident_id,user_id,rule_code) DO UPDATE SET last_source_at=EXCLUDED.last_source_at,last_alerted_at=now(),resolved_at=NULL`, [row.incidentId,row.userId,row.lastHeartbeatAt??row.assignedAt]);
    }
  }

  async commandAcknowledgementSafety() {
    const rows=await this.db.query(`SELECT r.command_id AS "commandId",r.user_id AS "userId",c.incident_id AS "incidentId",c.issued_by AS "issuedBy",c.title,u.name AS "userName"
      FROM incident_command_receipts r JOIN incident_commands c ON c.command_id=r.command_id JOIN incidents i ON i.incident_id=c.incident_id JOIN users u ON u.user_id=r.user_id
      WHERE i.status<>'CLOSED' AND c.status='OPEN' AND r.status IN ('PENDING','RECEIVED','READ') AND c.acknowledgement_due_at<=now() AND r.escalated_at IS NULL`);
    for(const row of rows){
      await this.alerts.createFromSystem({incidentId:row.incidentId,alertType:'RISK_WARNING',message:`[명령 미응답] ${row.userName} · ${row.title}`,sourceType:'SENSOR',targetUserId:row.issuedBy,automationKey:`command-unacknowledged:${row.commandId}:${row.userId}`});
      await this.db.query(`UPDATE incident_command_receipts SET escalated_at=now(),updated_at=now() WHERE command_id=$1 AND user_id=$2 AND escalated_at IS NULL`,[row.commandId,row.userId]);
    }
  }

  private async expirePar() {
    const sessions = await this.db.query(`UPDATE accountability_sessions SET status='EXPIRED' WHERE status='OPEN' AND deadline_at<=now() RETURNING session_id AS "sessionId",incident_id AS "incidentId"`);
    for (const session of sessions) {
      const missing = await this.db.query(`SELECT a.user_id AS "userId" FROM incident_assignments a JOIN users u ON u.user_id=a.user_id WHERE a.incident_id=$1 AND u.role='RESPONDER' AND u.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM accountability_responses r WHERE r.session_id=$2 AND r.user_id=a.user_id)`, [session.incidentId, session.sessionId]);
      for (const person of missing) {
        const inserted = await this.db.query(`INSERT INTO emergency_signals(incident_id,user_id,signal_type,trigger_source,last_communication_at) SELECT $1,$2,'EVACUATION_ASSIST','PAR_TIMEOUT',now() WHERE NOT EXISTS(SELECT 1 FROM emergency_signals WHERE incident_id=$1 AND user_id=$2 AND trigger_source='PAR_TIMEOUT' AND status IN ('ACTIVE','ACKNOWLEDGED')) RETURNING signal_id AS "signalId"`, [session.incidentId, person.userId]);
        if (inserted.length) await this.alerts.createFromSystem({ incidentId: session.incidentId, alertType: 'RISK_WARNING', message: '[PAR 미응답] 대원 상태 확인 필요', sourceType: 'SENSOR', targetUserId: person.userId, automationKey: `par:${session.sessionId}:${person.userId}` });
      }
    }
  }

  private async repeatMaydays() {
    const rows = await this.db.query(`SELECT signal_id AS "signalId",incident_id AS "incidentId",user_id AS "userId" FROM emergency_signals WHERE status='ACTIVE'`);
    const minute = new Date().toISOString().slice(0, 16);
    for (const row of rows) await this.alerts.createFromSystem({ incidentId: row.incidentId, alertType: 'RISK_WARNING', message: '[MAYDAY 반복] 지휘관 확인 대기', sourceType: 'SENSOR', targetUserId: row.userId, automationKey: `mayday-repeat:${row.signalId}:${minute}` });
  }

  private async channels() {
    const candidates = await this.db.query(`SELECT d.alert_id AS "alertId",d.user_id AS "userId",u.phone,a.message,EXTRACT(EPOCH FROM(now()-d.queued_at)) AS age FROM alert_deliveries d JOIN alerts a ON a.alert_id=d.alert_id JOIN users u ON u.user_id=d.user_id JOIN incidents i ON i.incident_id=a.incident_id WHERE d.received_at IS NULL AND i.status<>'CLOSED'`);
    for (const row of candidates) {
      await this.enqueue('PUSH', `push:${row.alertId}:${row.userId}`, row);
      if (Number(row.age) >= 30) await this.enqueue('SMS', `sms:${row.alertId}:${row.userId}`, row);
      if (Number(row.age) >= 90) await this.enqueue('VOICE', `voice:${row.alertId}:${row.userId}`, row);
    }
  }

  private enqueue(type: string, key: string, payload: any) { return this.db.query(`INSERT INTO durable_jobs(job_type,idempotency_key,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(idempotency_key) DO NOTHING`, [type, key, JSON.stringify(payload)]); }

  private async processJobs() {
    const jobs = await this.db.manager.transaction(manager => manager.query(`WITH claim AS (SELECT job_id FROM durable_jobs WHERE status IN ('PENDING','FAILED') AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) UPDATE durable_jobs j SET status='PROCESSING',locked_at=now(),locked_by=$1,attempt_count=attempt_count+1 FROM claim WHERE j.job_id=claim.job_id RETURNING j.job_id AS "jobId",j.job_type AS "jobType",j.payload,j.attempt_count AS "attemptCount",j.max_attempts AS "maxAttempts"`, [this.workerId]));
    for (const job of jobs) {
      try {
        await this.deliver(job.jobType, job.payload);
        await this.db.query(`UPDATE durable_jobs SET status='SUCCEEDED',completed_at=now(),last_error=NULL WHERE job_id=$1`, [job.jobId]);
        if (['SMS', 'VOICE'].includes(job.jobType)) await this.channelAttempt(job.payload, job.jobType, 'SENT', null);
      } catch (error) {
        const message = error instanceof Error ? error.message : '전송 실패', terminal = Number(job.attemptCount) >= Number(job.maxAttempts);
        await this.db.query(`UPDATE durable_jobs SET status=$2,last_error=$3,next_attempt_at=now()+(LEAST(30,POWER(2,$4))::text||' minutes')::interval WHERE job_id=$1`, [job.jobId, terminal ? 'DEAD' : 'FAILED', message, job.attemptCount]);
        if (['SMS', 'VOICE'].includes(job.jobType)) await this.channelAttempt(job.payload, job.jobType, this.gateway(job.jobType) ? 'FAILED' : 'UNAVAILABLE', message);
      }
    }
  }

  private gateway(type: string) { return this.config.get<string>(`${type}_GATEWAY_URL`); }
  private async deliver(type: string, payload: any) {
    const url = type === 'INTERAGENCY' ? this.config.get<string>('INTERAGENCY_WEBHOOK_URL') : this.gateway(type);
    if (!url) throw new Error(`${type} 게이트웨이 미설정`);
    await this.ensureCircuit(type);
    let body = payload;
    if (type === 'PUSH') {
      const subscriptions = await this.db.query(`SELECT platform,endpoint_token AS "endpointToken" FROM push_subscriptions WHERE user_id=$1 AND active`, [payload.userId]);
      if (!subscriptions.length) throw new Error('활성 푸시 구독 없음');
      body = { subscriptions, message: payload.message, alertId: payload.alertId };
    }
    const token = this.secret(type === 'INTERAGENCY' ? 'INTERAGENCY_TOKEN' : 'MULTICHANNEL_TOKEN');
    try {
      const response = await this.postJson(url, { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await this.recordCircuit(type, true, null);
      if (type === 'INTERAGENCY' && payload.packetId) await this.db.query(`UPDATE collaboration_packets SET status='SHARED',shared_at=now() WHERE packet_id=$1`, [payload.packetId]);
    } catch (error) {
      await this.recordCircuit(type, false, error instanceof Error ? error.message : 'unknown error');
      throw error;
    }
  }

  private secret(name: string) {
    const file=this.config.get<string>(`${name}_FILE`);
    if(file) return readFileSync(file,'utf8').trim();
    const provider=this.config.get<string>('SECRET_PROVIDER','env');
    if(provider!=='env'&&this.config.get<string>('SECURITY_FAIL_CLOSED','true')==='true') throw new Error(`${provider}가 주입할 ${name}_FILE 미설정`);
    return this.config.get<string>(name);
  }

  private async postJson(url: string, headers: Record<string,string>, body: unknown): Promise<{ok:boolean;status:number}> {
    const requireMtls=this.config.get<string>('REQUIRE_PROVIDER_MTLS','false')==='true';
    if (!requireMtls) return fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    if (!url.startsWith('https://')) throw new Error('mTLS 필수 환경은 HTTPS 공급자 URL만 허용합니다.');
    const certPath=this.config.get<string>('MTLS_CERT_PATH'),keyPath=this.config.get<string>('MTLS_KEY_PATH'),caPath=this.config.get<string>('MTLS_CA_PATH');
    if(!certPath||!keyPath||!caPath) throw new Error('mTLS 인증서 경로 미설정');
    return new Promise((resolve,reject)=>{
      const request=httpsRequest(url,{method:'POST',headers,cert:readFileSync(certPath),key:readFileSync(keyPath),ca:readFileSync(caPath),rejectUnauthorized:true,timeout:5000},response=>{response.resume();resolve({ok:Boolean(response.statusCode&&response.statusCode>=200&&response.statusCode<300),status:response.statusCode??0});});
      request.on('timeout',()=>request.destroy(new Error('mTLS gateway timeout')));request.on('error',reject);request.end(JSON.stringify(body));
    });
  }

  private async ensureCircuit(provider: string) {
    const state = (await this.db.query(`SELECT state,next_probe_at FROM provider_circuit_breakers WHERE provider_key=$1`, [provider]))[0];
    if (!state) return;
    if (state.state === 'OPEN' && state.next_probe_at && new Date(state.next_probe_at) > new Date()) throw new Error(`${provider} 회로 차단기 OPEN`);
    if (state.state === 'OPEN') await this.db.query(`UPDATE provider_circuit_breakers SET state='HALF_OPEN',updated_at=now() WHERE provider_key=$1`, [provider]);
  }

  private recordCircuit(provider: string, success: boolean, error: string | null) {
    if (success) return this.db.query(`INSERT INTO provider_circuit_breakers(provider_key,state,success_count,last_success_at) VALUES($1,'CLOSED',1,now()) ON CONFLICT(provider_key) DO UPDATE SET state='CLOSED',consecutive_failures=0,success_count=provider_circuit_breakers.success_count+1,last_success_at=now(),last_error=NULL,opened_at=NULL,next_probe_at=NULL,updated_at=now()`, [provider]);
    return this.db.query(`INSERT INTO provider_circuit_breakers(provider_key,state,consecutive_failures,failure_count,opened_at,next_probe_at,last_failure_at,last_error) VALUES($1,'CLOSED',1,1,NULL,NULL,now(),$2) ON CONFLICT(provider_key) DO UPDATE SET consecutive_failures=provider_circuit_breakers.consecutive_failures+1,failure_count=provider_circuit_breakers.failure_count+1,state=CASE WHEN provider_circuit_breakers.consecutive_failures+1>=5 THEN 'OPEN' ELSE provider_circuit_breakers.state END,opened_at=CASE WHEN provider_circuit_breakers.consecutive_failures+1>=5 THEN now() ELSE provider_circuit_breakers.opened_at END,next_probe_at=CASE WHEN provider_circuit_breakers.consecutive_failures+1>=5 THEN now()+interval '2 minutes' ELSE provider_circuit_breakers.next_probe_at END,last_failure_at=now(),last_error=$2,updated_at=now()`, [provider,error]);
  }

  private channelAttempt(row: any, channel: string, status: string, error: string | null) { return this.db.query(`INSERT INTO notification_channel_attempts(alert_id,user_id,channel,status,last_error,next_retry_at) VALUES($1::uuid,$2::uuid,$3::varchar,$4::varchar,$5,NULL) ON CONFLICT(alert_id,user_id,channel) DO UPDATE SET status=EXCLUDED.status,last_error=EXCLUDED.last_error,last_attempt_at=now(),attempt_count=notification_channel_attempts.attempt_count+1,next_retry_at=NULL`, [row.alertId, row.userId, channel, status, error]); }

  private async captureDrift() {
    const recent = await this.db.query(`SELECT 1 FROM ai_drift_snapshots WHERE created_at>=now()-interval '1 hour' LIMIT 1`);
    if (recent.length) return;
    const rows = await this.db.query(`SELECT COUNT(*)::int AS samples,COUNT(*) FILTER(WHERE verdict='FALSE_POSITIVE')::int AS fp,COUNT(*) FILTER(WHERE verdict='FALSE_NEGATIVE')::int AS fn FROM ai_judgment_feedback WHERE reviewed_at>=now()-interval '7 days'`);
    const count = Number(rows[0].samples), fp = count ? Number(rows[0].fp) / count : null, fn = count ? Number(rows[0].fn) / count : null;
    const status = count < 20 ? 'INSUFFICIENT_DATA' : Math.max(fp ?? 0, fn ?? 0) >= .25 ? 'DRIFTED' : Math.max(fp ?? 0, fn ?? 0) >= .15 ? 'WATCH' : 'STABLE';
    await this.db.query(`INSERT INTO ai_drift_snapshots(model_name,window_start,window_end,sample_count,false_positive_rate,false_negative_rate,drift_status) VALUES('fire-detection',now()-interval '7 days',now(),$1,$2,$3,$4)`, [count, fp, fn, status]);
    if (status === 'DRIFTED') await this.rollbackDriftedModel('fire-detection', count, fp, fn);
  }

  private async rollbackDriftedModel(modelName: string, samples: number, fp: number | null, fn: number | null) {
    const policy = (await this.db.query(`SELECT * FROM ai_guardrail_policies WHERE model_name=$1 AND auto_rollback AND $2>=minimum_samples AND ($3>=max_false_positive_rate OR $4>=max_false_negative_rate)`, [modelName,samples,fp,fn]))[0];
    if (!policy) return;
    await this.db.manager.transaction(async manager => {
      const active = (await manager.query(`SELECT release_id FROM ai_model_releases WHERE model_name=$1 AND status='ACTIVE' FOR UPDATE`, [modelName]))[0];
      const previous = (await manager.query(`SELECT release_id FROM ai_model_releases WHERE model_name=$1 AND status='ROLLED_BACK' ORDER BY activated_at DESC NULLS LAST LIMIT 1 FOR UPDATE`, [modelName]))[0];
      if (!active || !previous) return;
      await manager.query(`UPDATE ai_model_releases SET status='REJECTED' WHERE release_id=$1`, [active.release_id]);
      await manager.query(`UPDATE ai_model_releases SET status='ACTIVE',activated_at=now(),rollback_of=$2 WHERE release_id=$1`, [previous.release_id,active.release_id]);
    });
  }

  private async measureSlo() {
    const recent = await this.db.query(`SELECT 1 FROM slo_measurements WHERE measured_at>=now()-interval '5 minutes' LIMIT 1`);
    if (recent.length) return;
    const delivery = (await this.db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE received_at IS NOT NULL AND received_at<=queued_at+interval '30 seconds')::int AS good FROM alert_deliveries WHERE queued_at>=now()-interval '5 minutes'`))[0];
    const mayday = (await this.db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE acknowledged_at IS NOT NULL AND acknowledged_at<=activated_at+interval '60 seconds')::int AS good FROM emergency_signals WHERE activated_at>=now()-interval '5 minutes'`))[0];
    await this.db.query(`INSERT INTO slo_measurements(metric_key,good_count,total_count,dimensions) VALUES('alert_delivery',$1,$2,'{"source":"automation"}'::jsonb),('mayday_ack',$3,$4,'{"source":"automation"}'::jsonb),('api_availability',1,1,'{"source":"automation"}'::jsonb)`, [delivery.good,delivery.total,mayday.good,mayday.total]);
  }
}

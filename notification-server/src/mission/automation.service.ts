import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hostname } from 'node:os';
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
      await this.safety(); await this.expirePar(); await this.repeatMaydays();
      await this.channels(); await this.processJobs(); await this.captureDrift();
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
    let body = payload;
    if (type === 'PUSH') {
      const subscriptions = await this.db.query(`SELECT platform,endpoint_token AS "endpointToken" FROM push_subscriptions WHERE user_id=$1 AND active`, [payload.userId]);
      if (!subscriptions.length) throw new Error('활성 푸시 구독 없음');
      body = { subscriptions, message: payload.message, alertId: payload.alertId };
    }
    const token = type === 'INTERAGENCY' ? this.config.get('INTERAGENCY_TOKEN') : this.config.get('MULTICHANNEL_TOKEN');
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (type === 'INTERAGENCY' && payload.packetId) await this.db.query(`UPDATE collaboration_packets SET status='SHARED',shared_at=now() WHERE packet_id=$1`, [payload.packetId]);
  }

  private channelAttempt(row: any, channel: string, status: string, error: string | null) { return this.db.query(`INSERT INTO notification_channel_attempts(alert_id,user_id,channel,status,last_error,next_retry_at) VALUES($1::uuid,$2::uuid,$3::varchar,$4::varchar,$5,NULL) ON CONFLICT(alert_id,user_id,channel) DO UPDATE SET status=EXCLUDED.status,last_error=EXCLUDED.last_error,last_attempt_at=now(),attempt_count=notification_channel_attempts.attempt_count+1,next_retry_at=NULL`, [row.alertId, row.userId, channel, status, error]); }

  private async captureDrift() {
    const recent = await this.db.query(`SELECT 1 FROM ai_drift_snapshots WHERE created_at>=now()-interval '1 hour' LIMIT 1`);
    if (recent.length) return;
    const rows = await this.db.query(`SELECT COUNT(*)::int AS samples,COUNT(*) FILTER(WHERE verdict='FALSE_POSITIVE')::int AS fp,COUNT(*) FILTER(WHERE verdict='FALSE_NEGATIVE')::int AS fn FROM ai_judgment_feedback WHERE reviewed_at>=now()-interval '7 days'`);
    const count = Number(rows[0].samples), fp = count ? Number(rows[0].fp) / count : null, fn = count ? Number(rows[0].fn) / count : null;
    const status = count < 20 ? 'INSUFFICIENT_DATA' : Math.max(fp ?? 0, fn ?? 0) >= .25 ? 'DRIFTED' : Math.max(fp ?? 0, fn ?? 0) >= .15 ? 'WATCH' : 'STABLE';
    await this.db.query(`INSERT INTO ai_drift_snapshots(model_name,window_start,window_end,sample_count,false_positive_rate,false_negative_rate,drift_status) VALUES('fire-detection',now()-interval '7 days',now(),$1,$2,$3,$4)`, [count, fp, fn, status]);
  }
}

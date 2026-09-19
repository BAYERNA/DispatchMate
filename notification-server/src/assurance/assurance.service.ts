import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AssuranceService {
  constructor(@InjectRepository(Alert) private readonly db: Repository<Alert>) {}
  private admin(user: AuthenticatedUser) { if (user.role !== 'ADMIN') throw new ForbiddenException(); }

  private candidateQuery(category: string) {
    if (category === 'radio_transcript') return { count: `SELECT COUNT(*)::int AS count FROM radio_transcripts WHERE created_at<$1`, sample: `SELECT transcript_id::text AS ref FROM radio_transcripts WHERE created_at<$1 ORDER BY created_at LIMIT 20` };
    if (category === 'location_history') return { count: `SELECT COUNT(*)::int AS count FROM indoor_position_updates WHERE recorded_at<$1`, sample: `SELECT position_id::text AS ref FROM indoor_position_updates WHERE recorded_at<$1 ORDER BY recorded_at LIMIT 20` };
    if (category === 'evidence') return { count: `SELECT COUNT(*)::int AS count FROM evidence_assets WHERE collected_at<$1 AND NOT legal_hold`, sample: `SELECT evidence_id::text AS ref FROM evidence_assets WHERE collected_at<$1 AND NOT legal_hold ORDER BY collected_at LIMIT 20`, protected: `SELECT COUNT(*)::int AS count FROM evidence_assets WHERE collected_at<$1 AND legal_hold` };
    if (category === 'audit_log') return { count: `SELECT COUNT(*)::int AS count FROM immutable_audit_events WHERE occurred_at<$1`, sample: `SELECT audit_id::text AS ref FROM immutable_audit_events WHERE occurred_at<$1 ORDER BY sequence_no LIMIT 20` };
    throw new BadRequestException('실행 어댑터가 없는 데이터 범주입니다.');
  }

  async previewRetention(policyId: string, user: AuthenticatedUser) {
    this.admin(user);
    const policy = (await this.db.query(`SELECT policy_id,data_category,retention_days,action,legal_hold,enabled FROM data_retention_policies WHERE policy_id=$1`, [policyId]))[0];
    if (!policy?.enabled || policy.legal_hold) throw new BadRequestException('비활성 또는 법적 보존 정책은 실행할 수 없습니다.');
    const cutoff = new Date(Date.now() - Number(policy.retention_days) * 86400000).toISOString();
    const query = this.candidateQuery(policy.data_category);
    const count = Number((await this.db.query(query.count, [cutoff]))[0].count);
    const protectedCount = query.protected ? Number((await this.db.query(query.protected, [cutoff]))[0].count) : 0;
    const refs = (await this.db.query(query.sample, [cutoff])).map((row: any) => row.ref);
    return (await this.db.query(`INSERT INTO retention_execution_plans(policy_id,cutoff_at,candidate_count,protected_count,sample_refs,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING execution_id AS "executionId",status,candidate_count AS "candidateCount",protected_count AS "protectedCount",sample_refs AS "sampleRefs",cutoff_at AS "cutoffAt"`, [policyId, cutoff, count, protectedCount, JSON.stringify(refs), user.userId]))[0];
  }

  async approveRetention(executionId: string, user: AuthenticatedUser) {
    this.admin(user);
    const rows = await this.db.query(`UPDATE retention_execution_plans SET status='APPROVED',approved_by=$2,approved_at=now() WHERE execution_id=$1 AND status='PREVIEW' AND created_by<>$2 RETURNING execution_id AS "executionId",status`, [executionId, user.userId]);
    if (!rows.length) throw new BadRequestException('작성자와 다른 관리자의 승인이 필요합니다.');
    return rows[0];
  }

  async executeRetention(executionId: string, user: AuthenticatedUser) {
    this.admin(user);
    return this.db.manager.transaction(async manager => {
      const plan = (await manager.query(`SELECT e.*,p.data_category,p.action FROM retention_execution_plans e JOIN data_retention_policies p ON p.policy_id=e.policy_id WHERE e.execution_id=$1 FOR UPDATE`, [executionId]))[0];
      if (!plan || plan.status !== 'APPROVED') throw new BadRequestException('승인된 실행 계획이 아닙니다.');
      await manager.query(`UPDATE retention_execution_plans SET status='RUNNING' WHERE execution_id=$1`, [executionId]);
      let result;
      if (plan.data_category === 'radio_transcript' && plan.action === 'ANONYMIZE') result = await manager.query(`UPDATE radio_transcripts SET speaker_label=NULL,transcript='[보존정책에 따라 익명화됨]',audio_uri=NULL WHERE created_at<$1 RETURNING transcript_id`, [plan.cutoff_at]);
      else if (plan.data_category === 'location_history' && plan.action === 'DELETE') result = await manager.query(`DELETE FROM indoor_position_updates WHERE recorded_at<$1 RETURNING position_id`, [plan.cutoff_at]);
      else throw new BadRequestException('ARCHIVE 정책은 외부 WORM 아카이브 검증 후에만 완료할 수 있습니다.');
      const rows = await manager.query(`UPDATE retention_execution_plans SET status='SUCCEEDED',executed_count=$2,completed_at=now() WHERE execution_id=$1 RETURNING execution_id AS "executionId",status,executed_count AS "executedCount"`, [executionId, result.length]);
      return rows[0];
    });
  }

  async sloDashboard(user: AuthenticatedUser) {
    this.admin(user);
    return this.db.query(`SELECT o.metric_key AS "metricKey",o.name,o.target_ratio::float AS "targetRatio",o.threshold_ms AS "thresholdMs",COALESCE(SUM(m.good_count),0)::int AS "goodCount",COALESCE(SUM(m.total_count),0)::int AS "totalCount",CASE WHEN COALESCE(SUM(m.total_count),0)=0 THEN NULL ELSE SUM(m.good_count)::float/SUM(m.total_count) END AS "actualRatio" FROM slo_objectives o LEFT JOIN slo_measurements m ON m.metric_key=o.metric_key AND m.measured_at>=now()-(o.window_minutes::text||' minutes')::interval WHERE o.enabled GROUP BY o.objective_id ORDER BY o.metric_key`);
  }

  async recordSlo(user: AuthenticatedUser, body: any) {
    this.admin(user);
    const good = Number(body.goodCount), total = Number(body.totalCount);
    if (!body.metricKey || !Number.isInteger(good) || !Number.isInteger(total) || good < 0 || total < good) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO slo_measurements(metric_key,good_count,total_count,latency_ms,dimensions) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING measurement_id AS "measurementId"`, [body.metricKey, good, total, body.latencyMs ?? null, JSON.stringify(body.dimensions ?? {})]))[0];
  }

  async certificate(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.serviceName?.trim() || !/^[a-f0-9]{64}$/i.test(body.fingerprintSha256 ?? '') || !['VAULT','KMS','FILE','PLATFORM'].includes(body.source)) throw new BadRequestException();
    if (new Date(body.notAfter) <= new Date(body.notBefore)) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO certificate_inventory(service_name,fingerprint_sha256,subject_dn,issuer_dn,not_before,not_after,source) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(service_name) DO UPDATE SET fingerprint_sha256=EXCLUDED.fingerprint_sha256,subject_dn=EXCLUDED.subject_dn,issuer_dn=EXCLUDED.issuer_dn,not_before=EXCLUDED.not_before,not_after=EXCLUDED.not_after,source=EXCLUDED.source,last_verified_at=now() RETURNING certificate_id AS "certificateId",not_after AS "notAfter"`, [body.serviceName.trim(), body.fingerprintSha256.toLowerCase(), body.subjectDn, body.issuerDn, body.notBefore, body.notAfter, body.source]))[0];
  }

  async guardrail(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.modelName?.trim() || Number(body.minimumSamples) < 20) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO ai_guardrail_policies(model_name,max_false_positive_rate,max_false_negative_rate,minimum_samples,auto_rollback,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(model_name) DO UPDATE SET max_false_positive_rate=EXCLUDED.max_false_positive_rate,max_false_negative_rate=EXCLUDED.max_false_negative_rate,minimum_samples=EXCLUDED.minimum_samples,auto_rollback=EXCLUDED.auto_rollback,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING policy_id AS "policyId",auto_rollback AS "autoRollback"`, [body.modelName.trim(),body.maxFalsePositiveRate ?? .25,body.maxFalseNegativeRate ?? .20,body.minimumSamples,body.autoRollback===true,user.userId]))[0];
  }

  async resetCircuit(provider: string, user: AuthenticatedUser) {
    this.admin(user);
    const rows = await this.db.query(`UPDATE provider_circuit_breakers SET state='HALF_OPEN',consecutive_failures=0,next_probe_at=now(),updated_at=now() WHERE provider_key=$1 RETURNING provider_key AS "providerKey",state`, [provider]);
    if (!rows.length) throw new NotFoundException();
    return rows[0];
  }

  async requestApproval(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.actionType || !body.resourceType || !body.resourceId) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO privileged_action_approvals(action_type,resource_type,resource_id,request_payload,requested_by,expires_at) VALUES($1,$2,$3,$4::jsonb,$5,now()+interval '30 minutes') RETURNING approval_id AS "approvalId",status,expires_at AS "expiresAt"`, [body.actionType, body.resourceType, body.resourceId, JSON.stringify(body.payload ?? {}), user.userId]))[0];
  }

  async decideApproval(id: string, user: AuthenticatedUser, decision: string) {
    this.admin(user);
    if (!['APPROVED','REJECTED'].includes(decision)) throw new BadRequestException();
    const rows = await this.db.query(`UPDATE privileged_action_approvals SET status=$3,approved_by=$2,decided_at=now() WHERE approval_id=$1 AND status='PENDING' AND expires_at>now() AND requested_by<>$2 RETURNING approval_id AS "approvalId",status`, [id,user.userId,decision]);
    if (!rows.length) throw new BadRequestException('다른 관리자의 유효한 승인이 필요합니다.');
    return rows[0];
  }

  async fieldDevice(user: AuthenticatedUser, body: any) {
    if (!['ANDROID','IOS','WEB','WEARABLE'].includes(body.platform) || !body.deviceFingerprint?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO managed_field_devices(user_id,platform,device_fingerprint,encryption_capability,background_location_enabled) VALUES($1,$2,$3,$4,$5) ON CONFLICT(device_fingerprint) DO UPDATE SET user_id=EXCLUDED.user_id,last_seen_at=now(),encryption_capability=EXCLUDED.encryption_capability,background_location_enabled=EXCLUDED.background_location_enabled RETURNING device_registration_id AS "deviceRegistrationId",attestation_status AS "attestationStatus"`, [user.userId,body.platform,body.deviceFingerprint.trim(),body.encryptionCapability ?? null,body.backgroundLocationEnabled===true]))[0];
  }

  async deviceAction(id: string, user: AuthenticatedUser, action: string) {
    this.admin(user);
    if (!['VERIFY','REVOKE','REMOTE_WIPE'].includes(action)) throw new BadRequestException();
    const rows = action === 'REMOTE_WIPE'
      ? await this.db.query(`UPDATE managed_field_devices SET remote_wipe_requested_at=now() WHERE device_registration_id=$1 RETURNING device_registration_id AS "deviceRegistrationId",attestation_status AS "attestationStatus",remote_wipe_requested_at AS "remoteWipeRequestedAt"`,[id])
      : await this.db.query(`UPDATE managed_field_devices SET attestation_status=$2 WHERE device_registration_id=$1 RETURNING device_registration_id AS "deviceRegistrationId",attestation_status AS "attestationStatus"`,[id,action==='VERIFY'?'VERIFIED':'REVOKED']);
    if (!rows.length) throw new NotFoundException();
    return rows[0];
  }

  async temporaryGrant(user: AuthenticatedUser, body: any) {
    this.admin(user);
    const minutes=Math.min(480,Math.max(5,Number(body.ttlMinutes ?? 60)));
    if (!body.userId || !body.permission?.trim() || !body.reason?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO temporary_access_grants(user_id,incident_id,permission,reason,granted_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+($6::text||' minutes')::interval) RETURNING grant_id AS "grantId",expires_at AS "expiresAt"`,[body.userId,body.incidentId ?? null,body.permission.trim(),body.reason.trim(),user.userId,minutes]))[0];
  }

  async revokeGrant(id: string, user: AuthenticatedUser) {
    this.admin(user);
    const rows=await this.db.query(`UPDATE temporary_access_grants SET revoked_at=now() WHERE grant_id=$1 AND revoked_at IS NULL RETURNING grant_id AS "grantId",revoked_at AS "revokedAt"`,[id]);
    if(!rows.length) throw new NotFoundException();
    return rows[0];
  }

  async offlineAsset(user: AuthenticatedUser, body: any) {
    if (!body.assetId || !body.mediaType || !/^[a-f0-9]{64}$/i.test(body.contentHash ?? '') || Number(body.byteSize) <= 0) throw new BadRequestException();
    const priority = Math.min(9,Math.max(1,Number(body.priority ?? 5)));
    return (await this.db.query(`INSERT INTO offline_asset_manifests(asset_id,user_id,incident_id,media_type,byte_size,content_hash,encryption,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(asset_id) DO UPDATE SET priority=LEAST(offline_asset_manifests.priority,EXCLUDED.priority) RETURNING asset_id AS "assetId",status,priority`, [body.assetId,user.userId,body.incidentId ?? null,body.mediaType,body.byteSize,body.contentHash.toLowerCase(),body.encryption ?? 'AES-GCM',priority]))[0];
  }

  async auditExport(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.artifactUri?.trim() || !/^[a-f0-9]{64}$/i.test(body.artifactHash ?? '')) throw new BadRequestException();
    const range = (await this.db.query(`SELECT COALESCE(MIN(sequence_no),0) AS first,COALESCE(MAX(sequence_no),0) AS last,COUNT(*)::int AS count,(SELECT event_hash FROM immutable_audit_events ORDER BY sequence_no DESC LIMIT 1) AS head FROM immutable_audit_events WHERE sequence_no>$1`, [Number(body.afterSequence ?? 0)]))[0];
    if (!range.count) throw new NotFoundException('내보낼 감사 이벤트가 없습니다.');
    return (await this.db.query(`INSERT INTO audit_export_manifests(from_sequence,to_sequence,event_count,head_hash,artifact_uri,artifact_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING export_id AS "exportId",status,event_count AS "eventCount"`, [range.first,range.last,range.count,range.head,body.artifactUri.trim(),body.artifactHash.toLowerCase(),user.userId]))[0];
  }

  async overview(user: AuthenticatedUser) {
    this.admin(user);
    const [retention,policies,circuits,certs,approvals,devices,slo] = await Promise.all([
      this.db.query(`SELECT execution_id AS "executionId",status,candidate_count AS "candidateCount",executed_count AS "executedCount",created_at AS "createdAt" FROM retention_execution_plans ORDER BY created_at DESC LIMIT 10`),
      this.db.query(`SELECT policy_id AS "policyId",data_category AS "dataCategory",retention_days AS "retentionDays",action,legal_hold AS "legalHold",enabled FROM data_retention_policies ORDER BY data_category`),
      this.db.query(`SELECT provider_key AS "providerKey",state,consecutive_failures AS "consecutiveFailures",last_error AS "lastError",updated_at AS "updatedAt" FROM provider_circuit_breakers ORDER BY provider_key`),
      this.db.query(`SELECT service_name AS "serviceName",not_after AS "notAfter",source FROM certificate_inventory ORDER BY not_after`),
      this.db.query(`SELECT COUNT(*)::int AS count FROM privileged_action_approvals WHERE status='PENDING' AND expires_at>now()`),
      this.db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE attestation_status='VERIFIED')::int AS verified FROM managed_field_devices`),
      this.sloDashboard(user),
    ]);
    const deviceList=await this.db.query(`SELECT device_registration_id AS "deviceRegistrationId",platform,attestation_status AS "attestationStatus",encryption_capability AS "encryptionCapability",background_location_enabled AS "backgroundLocationEnabled",last_seen_at AS "lastSeenAt" FROM managed_field_devices ORDER BY last_seen_at DESC LIMIT 50`);
    return { retention, retentionPolicies: policies, circuits, certificates: certs, pendingApprovals: approvals[0].count, fieldDevices: devices[0], deviceList, slo };
  }
}

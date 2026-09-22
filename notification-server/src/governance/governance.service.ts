import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { OrganizationScopeService } from '../common/organization-scope/organization-scope.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
};

@Injectable()
export class GovernanceService {
  constructor(
    @InjectRepository(Alert) private readonly db: Repository<Alert>,
    private readonly config: ConfigService,
    private readonly orgScope: OrganizationScopeService,
  ) {}

  private operator(user: AuthenticatedUser) { if (!['ADMIN', 'COMMANDER'].includes(user.role)) throw new ForbiddenException(); }
  private admin(user: AuthenticatedUser) { if (user.role !== 'ADMIN') throw new ForbiddenException(); }

  async acquireLease(key: string, ownerId: string, ttlSeconds = 30) {
    if (!key?.trim() || !ownerId?.trim() || ttlSeconds < 5 || ttlSeconds > 300) throw new BadRequestException();
    const rows = await this.db.query(
      `INSERT INTO cluster_leases(lease_key,owner_id,expires_at) VALUES($1,$2,now()+($3::text||' seconds')::interval)
       ON CONFLICT(lease_key) DO UPDATE SET owner_id=EXCLUDED.owner_id,fencing_token=cluster_leases.fencing_token+1,
       acquired_at=now(),heartbeat_at=now(),expires_at=EXCLUDED.expires_at
       WHERE cluster_leases.expires_at<now() OR cluster_leases.owner_id=EXCLUDED.owner_id
       RETURNING lease_key AS "leaseKey",owner_id AS "ownerId",fencing_token AS "fencingToken",expires_at AS "expiresAt"`,
      [key.trim(), ownerId.trim(), ttlSeconds],
    );
    return rows[0] ?? null;
  }

  async releaseLease(key: string, ownerId: string, fencingToken: number) {
    const rows = await this.db.query(`DELETE FROM cluster_leases WHERE lease_key=$1 AND owner_id=$2 AND fencing_token=$3 RETURNING lease_key AS "leaseKey"`, [key, ownerId, fencingToken]);
    return { released: rows.length === 1 };
  }

  async audit(user: AuthenticatedUser, action: string, resourceType: string, resourceId: string | null, payload: unknown, incidentId?: string) {
    if (!action?.trim() || !resourceType?.trim()) throw new BadRequestException();
    if (incidentId) await this.orgScope.assertIncident(user, incidentId);
    return this.db.manager.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext('dispatchmate:audit-chain'))`);
      const previous = (await manager.query(`SELECT event_hash FROM immutable_audit_events ORDER BY sequence_no DESC LIMIT 1`))[0]?.event_hash ?? null;
      const occurredAt = new Date().toISOString();
      const canonical = stable({ previous, actorId: user.userId, actorRole: user.role, action, resourceType, resourceId, incidentId: incidentId ?? null, payload, occurredAt });
      const hash = sha256(canonical);
      return (await manager.query(
        `INSERT INTO immutable_audit_events(actor_id,actor_role,action,resource_type,resource_id,incident_id,payload,previous_hash,event_hash,occurred_at)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING audit_id AS "auditId",sequence_no AS "sequenceNo",event_hash AS "eventHash",occurred_at AS "occurredAt"`,
        [user.userId, user.role, action.trim(), resourceType.trim(), resourceId, incidentId ?? null, JSON.stringify(payload ?? {}), previous, hash, occurredAt],
      ))[0];
    });
  }

  async verifyAudit(user: AuthenticatedUser) {
    this.operator(user);
    const events = await this.db.query(`SELECT sequence_no,actor_id,actor_role,action,resource_type,resource_id,incident_id,payload,previous_hash,event_hash,occurred_at FROM immutable_audit_events ORDER BY sequence_no`);
    let previous: string | null = null;
    for (const event of events) {
      const occurredAt = new Date(event.occurred_at).toISOString();
      const canonical = stable({ previous, actorId: event.actor_id, actorRole: event.actor_role, action: event.action, resourceType: event.resource_type, resourceId: event.resource_id, incidentId: event.incident_id, payload: event.payload, occurredAt });
      const expected = sha256(canonical);
      if (event.previous_hash !== previous || event.event_hash !== expected) return { valid: false, checked: events.length, brokenAt: Number(event.sequence_no) };
      previous = event.event_hash;
    }
    return { valid: true, checked: events.length, headHash: previous };
  }

  securityReadiness(user: AuthenticatedUser) {
    this.admin(user);
    const secretProvider = this.config.get<string>('SECRET_PROVIDER', 'env');
    const mtls = ['MTLS_CERT_PATH', 'MTLS_KEY_PATH', 'MTLS_CA_PATH'].every(key => Boolean(this.config.get<string>(key)));
    return {
      secretProvider,
      externalSecretManagerConfigured: ['vault', 'aws-kms', 'gcp-kms', 'azure-key-vault'].includes(secretProvider),
      mtlsConfigured: mtls,
      mtlsRequired: this.config.get<string>('REQUIRE_PROVIDER_MTLS', 'false') === 'true',
      failClosed: this.config.get<string>('SECURITY_FAIL_CLOSED', 'true') === 'true',
      warnings: [!mtls && '서비스 간 mTLS 인증서 경로가 설정되지 않았습니다.', secretProvider === 'env' && '운영 환경에서는 Vault/KMS 계열 공급자를 사용하세요.'].filter(Boolean),
    };
  }

  async sync(user: AuthenticatedUser, body: any) {
    if (!body.mutationId || !body.entityType || !body.entityId || !['CREATE', 'UPDATE', 'DELETE'].includes(body.operation)) throw new BadRequestException();
    if (body.incidentId) await this.orgScope.assertIncident(user, body.incidentId);
    const duplicate = await this.db.query(`SELECT mutation_id AS "mutationId",resolution,server_version AS "serverVersion",conflict_fields AS "conflictFields" FROM sync_mutations WHERE mutation_id=$1`, [body.mutationId]);
    if (duplicate.length) return duplicate[0];
    const latest = (await this.db.query(`SELECT server_version,payload FROM sync_mutations WHERE entity_type=$1 AND entity_id=$2 ORDER BY server_version DESC LIMIT 1`, [body.entityType, body.entityId]))[0];
    const currentVersion = Number(latest?.server_version ?? 0);
    const conflicts = currentVersion > Number(body.baseVersion ?? 0) ? Object.keys(body.payload ?? {}).filter(key => stable(latest?.payload?.[key]) !== stable(body.payload?.[key])) : [];
    const resolution = conflicts.length ? 'CONFLICT' : 'APPLIED';
    return (await this.db.query(
      `INSERT INTO sync_mutations(mutation_id,user_id,incident_id,entity_type,entity_id,operation,base_version,server_version,client_timestamp,payload,resolution,conflict_fields,resolved_payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb)
       RETURNING mutation_id AS "mutationId",resolution,server_version AS "serverVersion",conflict_fields AS "conflictFields",resolved_payload AS "resolvedPayload"`,
      [body.mutationId, user.userId, body.incidentId ?? null, body.entityType, body.entityId, body.operation, body.baseVersion ?? 0, currentVersion + 1, body.clientTimestamp ?? new Date().toISOString(), JSON.stringify(body.payload ?? {}), resolution, JSON.stringify(conflicts), JSON.stringify(conflicts.length ? latest.payload : body.payload ?? {})],
    ))[0];
  }

  async registerModel(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.modelName?.trim() || !body.version?.trim() || !body.artifactUri?.trim() || !/^[a-f0-9]{64}$/i.test(body.artifactHash ?? '')) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO ai_model_releases(model_name,version,artifact_uri,artifact_hash,explanation,approval_required) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING release_id AS "releaseId",status`, [body.modelName.trim(), body.version.trim(), body.artifactUri.trim(), body.artifactHash.toLowerCase(), JSON.stringify(body.explanation ?? {}), body.approvalRequired !== false]))[0];
  }

  async modelAction(id: string, user: AuthenticatedUser, action: string) {
    this.admin(user);
    if (!['APPROVE', 'ACTIVATE', 'ROLLBACK', 'REJECT'].includes(action)) throw new BadRequestException();
    return this.db.manager.transaction(async manager => {
      const model = (await manager.query(`SELECT * FROM ai_model_releases WHERE release_id=$1 FOR UPDATE`, [id]))[0];
      if (!model) throw new NotFoundException();
      if (action === 'ACTIVATE' && model.approval_required && model.status !== 'APPROVED') throw new BadRequestException('승인된 모델만 활성화할 수 있습니다.');
      if (action === 'APPROVE') await manager.query(`UPDATE ai_model_releases SET status='APPROVED',approved_by=$2,approved_at=now() WHERE release_id=$1 AND status='CANDIDATE'`, [id, user.userId]);
      if (action === 'REJECT') await manager.query(`UPDATE ai_model_releases SET status='REJECTED' WHERE release_id=$1 AND status IN ('CANDIDATE','APPROVED')`, [id]);
      if (action === 'ACTIVATE') { await manager.query(`UPDATE ai_model_releases SET status='ROLLED_BACK' WHERE model_name=$1 AND status='ACTIVE'`, [model.model_name]); await manager.query(`UPDATE ai_model_releases SET status='ACTIVE',activated_at=now() WHERE release_id=$1`, [id]); }
      if (action === 'ROLLBACK') await manager.query(`UPDATE ai_model_releases SET status='ROLLED_BACK' WHERE release_id=$1 AND status='ACTIVE'`, [id]);
      return (await manager.query(`SELECT release_id AS "releaseId",status FROM ai_model_releases WHERE release_id=$1`, [id]))[0];
    });
  }

  async forecast(incidentId: string, user: AuthenticatedUser, body: any) {
    this.operator(user);
    await this.orgScope.assertIncident(user, incidentId);
    const horizon = Number(body.horizonMinutes ?? 60);
    if (!Number.isInteger(horizon) || horizon < 5 || horizon > 1440) throw new BadRequestException();
    const [assigned] = await this.db.query(`SELECT COUNT(*)::int AS count FROM incident_assignments WHERE incident_id=$1`, [incidentId]);
    const [signals] = await this.db.query(`SELECT COUNT(*)::int AS count FROM emergency_signals WHERE incident_id=$1 AND status IN ('ACTIVE','ACKNOWLEDGED')`, [incidentId]);
    const demand = { responders: Math.max(Number(assigned.count), 4) + Number(signals.count) * 2, medicalTeams: Number(signals.count) ? 1 : 0, reserveAirCylinders: Math.ceil(Math.max(Number(assigned.count), 1) * horizon / 45) };
    const disclaimer = '운영 지원용 추정치이며 지휘관 승인 없이 자동 배치하지 않습니다.';
    return (await this.db.query(`INSERT INTO resource_demand_forecasts(incident_id,horizon_minutes,demand,assumptions,confidence,disclaimer,created_by) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) RETURNING forecast_id AS "forecastId",demand,confidence,disclaimer`, [incidentId, horizon, JSON.stringify(demand), JSON.stringify({ assigned: assigned.count, activeMaydays: signals.count }), Number(assigned.count) >= 4 ? 'MEDIUM' : 'LOW', disclaimer, user.userId]))[0];
  }

  async createPublicToken(incidentId: string, user: AuthenticatedUser, body: any) {
    this.operator(user);
    await this.orgScope.assertIncident(user, incidentId);
    if (!['PUBLIC', 'FACILITY_MANAGER', 'FAMILY_LIAISON'].includes(body.audience)) throw new BadRequestException();
    const token = randomBytes(32).toString('base64url');
    const allowed = body.allowedFields ?? ['incidentNumber', 'status', 'incidentType', 'updatedAt'];
    const row = (await this.db.query(`INSERT INTO public_status_tokens(incident_id,token_hash,audience,allowed_fields,expires_at,created_by) VALUES($1,$2,$3,$4::jsonb,now()+($5::text||' minutes')::interval,$6) RETURNING token_id AS "tokenId",expires_at AS "expiresAt"`, [incidentId, sha256(token), body.audience, JSON.stringify(allowed), Math.min(1440, Math.max(5, Number(body.ttlMinutes ?? 60))), user.userId]))[0];
    return { ...row, token };
  }

  async recoveryRun(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!['BACKUP', 'RESTORE_DRILL', 'FAILOVER', 'FAILBACK', 'CHAOS'].includes(body.runType) || !body.targetEnvironment?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO disaster_recovery_runs(policy_id,run_type,target_environment,created_by) VALUES($1,$2,$3,$4) RETURNING run_id AS "runId",status,run_type AS "runType"`, [body.policyId ?? null, body.runType, body.targetEnvironment.trim(), user.userId]))[0];
  }

  async buildingModel(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.facilityName?.trim() || !['IFC', 'GLTF', 'GEOJSON', 'SVG'].includes(body.modelFormat) || !body.sourceUri?.trim() || !/^[a-f0-9]{64}$/i.test(body.contentHash ?? '')) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO building_models(facility_name,model_format,version,source_uri,content_hash,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING model_id AS "modelId",active`, [body.facilityName.trim(), body.modelFormat, body.version ?? '1', body.sourceUri.trim(), body.contentHash.toLowerCase(), JSON.stringify(body.metadata ?? {}), user.userId]))[0];
  }

  async transcript(incidentId: string, user: AuthenticatedUser, body: any) {
    this.operator(user);
    await this.orgScope.assertIncident(user, incidentId);
    if (!body.channelLabel?.trim() || !body.transcript?.trim() || !body.startedAt) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO radio_transcripts(incident_id,channel_label,speaker_label,transcript,language,confidence,audio_uri,started_at,ended_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING transcript_id AS "transcriptId",review_status AS "reviewStatus"`, [incidentId, body.channelLabel.trim(), body.speakerLabel?.trim() || null, body.transcript.trim(), body.language ?? 'ko', body.confidence ?? null, body.audioUri ?? null, body.startedAt, body.endedAt ?? null]))[0];
  }

  async signature(user: AuthenticatedUser, body: any) {
    if (!body.resourceType?.trim() || !body.resourceId || !/^[a-f0-9]{64}$/i.test(body.documentHash ?? '') || !body.signatureValue?.trim() || !body.publicKeyId?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO electronic_signatures(resource_type,resource_id,signer_id,signer_role,document_hash,signature_algorithm,signature_value,public_key_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING signature_id AS "signatureId",verification_status AS "verificationStatus",signed_at AS "signedAt"`, [body.resourceType.trim(), body.resourceId, user.userId, user.role, body.documentHash.toLowerCase(), body.signatureAlgorithm ?? 'ECDSA-SHA256', body.signatureValue.trim(), body.publicKeyId.trim()]))[0];
  }

  async retention(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.dataCategory?.trim() || !['DELETE', 'ANONYMIZE', 'ARCHIVE'].includes(body.action)) throw new BadRequestException();
    const days = Number(body.retentionDays);
    if (!Number.isInteger(days) || days < 1 || days > 36500) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO data_retention_policies(data_category,retention_days,action,legal_hold,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(data_category) DO UPDATE SET retention_days=EXCLUDED.retention_days,action=EXCLUDED.action,legal_hold=EXCLUDED.legal_hold,updated_at=now() RETURNING policy_id AS "policyId",data_category AS "dataCategory"`, [body.dataCategory.trim(), days, body.action, body.legalHold === true, user.userId]))[0];
  }

  async evidence(incidentId: string, user: AuthenticatedUser, body: any) {
    this.operator(user);
    await this.orgScope.assertIncident(user, incidentId);
    if (!['VIDEO', 'IMAGE', 'AUDIO', 'DOCUMENT', 'SENSOR'].includes(body.evidenceType) || !body.sourceUri?.trim() || !/^[a-f0-9]{64}$/i.test(body.contentHash ?? '')) throw new BadRequestException();
    const previous = (await this.db.query(`SELECT custody_hash FROM evidence_assets WHERE incident_id=$1 ORDER BY collected_at DESC LIMIT 1`, [incidentId]))[0]?.custody_hash ?? null;
    const custody = sha256(stable({ incidentId, type: body.evidenceType, uri: body.sourceUri, contentHash: body.contentHash.toLowerCase(), previous, collector: user.userId }));
    return (await this.db.query(`INSERT INTO evidence_assets(incident_id,evidence_type,source_uri,content_hash,previous_custody_hash,custody_hash,encryption_key_ref,retention_until,legal_hold,collected_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING evidence_id AS "evidenceId",custody_hash AS "custodyHash"`, [incidentId, body.evidenceType, body.sourceUri.trim(), body.contentHash.toLowerCase(), previous, custody, body.encryptionKeyRef ?? null, body.retentionUntil ?? null, body.legalHold === true, user.userId]))[0];
  }

  async agency(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.agencyCode?.trim() || !body.name?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO federation_agencies(agency_code,name,endpoint_uri,certificate_fingerprint,capabilities) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(agency_code) DO UPDATE SET name=EXCLUDED.name,endpoint_uri=EXCLUDED.endpoint_uri,certificate_fingerprint=EXCLUDED.certificate_fingerprint,capabilities=EXCLUDED.capabilities RETURNING agency_id AS "agencyId",trust_status AS "trustStatus"`, [body.agencyCode.trim(), body.name.trim(), body.endpointUri ?? null, body.certificateFingerprint ?? null, JSON.stringify(body.capabilities ?? [])]))[0];
  }

  async share(incidentId: string, user: AuthenticatedUser, body: any) {
    this.operator(user);
    await this.orgScope.assertIncident(user, incidentId);
    const trusted = await this.db.query(`SELECT 1 FROM federation_agencies WHERE agency_id=$1 AND trust_status='TRUSTED'`, [body.agencyId]);
    if (!trusted.length) throw new BadRequestException('신뢰 승인이 완료된 기관에만 공유할 수 있습니다.');
    return (await this.db.query(`INSERT INTO federation_shares(incident_id,agency_id,scope,expires_at,created_by) VALUES($1,$2,$3::jsonb,now()+($4::text||' minutes')::interval,$5) RETURNING share_id AS "shareId",status,expires_at AS "expiresAt"`, [incidentId, body.agencyId, JSON.stringify(body.scope ?? []), Math.min(1440, Math.max(5, Number(body.ttlMinutes ?? 60))), user.userId]))[0];
  }

  async preferences(user: AuthenticatedUser, body: any) {
    if (body.textScale != null && (Number(body.textScale) < 0.8 || Number(body.textScale) > 2)) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO user_interface_preferences(user_id,locale,high_contrast,reduced_motion,text_scale,role_layout) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id) DO UPDATE SET locale=EXCLUDED.locale,high_contrast=EXCLUDED.high_contrast,reduced_motion=EXCLUDED.reduced_motion,text_scale=EXCLUDED.text_scale,role_layout=EXCLUDED.role_layout,updated_at=now() RETURNING locale,high_contrast AS "highContrast",reduced_motion AS "reducedMotion",text_scale AS "textScale",role_layout AS "roleLayout"`, [user.userId, body.locale ?? 'ko-KR', body.highContrast === true, body.reducedMotion === true, Number(body.textScale ?? 1), JSON.stringify(body.roleLayout ?? {})]))[0];
  }

  async publicStatus(token: string) {
    if (!token) throw new NotFoundException();
    const hash = sha256(token);
    const rows = await this.db.query(`SELECT t.token_hash,t.allowed_fields,i.incident_number,i.status,i.incident_type,COALESCE(i.closed_at,i.reported_at) AS status_updated_at FROM public_status_tokens t JOIN incidents i ON i.incident_id=t.incident_id WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now()`, [hash]);
    if (!rows.length || !timingSafeEqual(Buffer.from(hash), Buffer.from(rows[0].token_hash))) throw new NotFoundException();
    const source: Record<string, unknown> = { incidentNumber: rows[0].incident_number, status: rows[0].status, incidentType: rows[0].incident_type, updatedAt: rows[0].status_updated_at };
    return Object.fromEntries((rows[0].allowed_fields as string[]).filter(key => key in source).map(key => [key, source[key]]));
  }

  async dashboard(user: AuthenticatedUser) {
    this.admin(user);
    const [audit, leases, models, federation, conflicts, evidence] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS count FROM immutable_audit_events`),
      this.db.query(`SELECT lease_key AS "leaseKey",owner_id AS "ownerId",fencing_token AS "fencingToken",expires_at AS "expiresAt" FROM cluster_leases WHERE expires_at>now()`),
      this.db.query(`SELECT release_id AS "releaseId",model_name AS "modelName",version,status,explanation FROM ai_model_releases ORDER BY created_at DESC LIMIT 20`),
      this.db.query(`SELECT agency_id AS "agencyId",agency_code AS "agencyCode",name,trust_status AS "trustStatus",capabilities FROM federation_agencies ORDER BY name`),
      this.db.query(`SELECT COUNT(*)::int AS count FROM sync_mutations WHERE resolution='CONFLICT'`),
      this.db.query(`SELECT COUNT(*)::int AS count FROM evidence_assets WHERE legal_hold`),
    ]);
    return { auditEvents: audit[0].count, activeLeases: leases, models, agencies: federation, unresolvedSyncConflicts: conflicts[0].count, legalHoldEvidence: evidence[0].count, security: this.securityReadiness(user) };
  }
}

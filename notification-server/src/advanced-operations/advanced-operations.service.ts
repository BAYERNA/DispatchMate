import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service';
import { Alert } from '../alerts/entities/alert.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { OrganizationScopeService } from '../common/organization-scope/organization-scope.service';

@Injectable()
export class AdvancedOperationsService {
  constructor(
    @InjectRepository(Alert) private readonly db: Repository<Alert>,
    private readonly alerts: AlertsService,
    private readonly config: ConfigService,
    private readonly orgScope: OrganizationScopeService,
  ) {}

  private operator(user: AuthenticatedUser) {
    if (!['ADMIN', 'COMMANDER'].includes(user.role)) throw new ForbiddenException();
  }

  private admin(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
  }

  private async permission(incidentId: string, user: AuthenticatedUser, permission: string) {
    if (['ADMIN', 'COMMANDER'].includes(user.role)) return;
    const rows = await this.db.query(
      `SELECT 1 FROM incident_assignments a JOIN incident_role_permissions p
       ON p.role_in_incident=COALESCE(a.role_in_incident,'ENTRY')
       WHERE a.incident_id=$1 AND a.user_id=$2 AND p.permission=$3`,
      [incidentId, user.userId, permission],
    );
    if (!rows.length) throw new ForbiddenException('현재 현장 역할에 허용되지 않은 작업입니다.');
  }

  async dashboard(incidentId: string, user: AuthenticatedUser) {
    await this.permission(incidentId, user, 'PAR_RESPOND');
    const [signals, par, routes, positions, zones, objectives, hospitals, handovers, twinRuns] = await Promise.all([
      this.db.query(`SELECT e.signal_id AS "signalId",e.user_id AS "userId",u.name AS "userName",e.signal_type AS "signalType",e.status,e.trigger_source AS "triggerSource",e.location,e.vitals,e.last_communication_at AS "lastCommunicationAt",e.activated_at AS "activatedAt" FROM emergency_signals e JOIN users u ON u.user_id=e.user_id WHERE e.incident_id=$1 ORDER BY e.activated_at DESC LIMIT 100`, [incidentId]),
      this.db.query(`SELECT s.session_id AS "sessionId",s.status,s.deadline_at AS "deadlineAt",s.team_label AS "teamLabel",COUNT(a.user_id)::int AS "expectedCount",COUNT(r.user_id)::int AS "responseCount",COALESCE(jsonb_agg(jsonb_build_object('userId',r.user_id,'response',r.response,'respondedAt',r.responded_at)) FILTER(WHERE r.user_id IS NOT NULL),'[]'::jsonb) AS responses FROM accountability_sessions s LEFT JOIN incident_assignments a ON a.incident_id=s.incident_id LEFT JOIN accountability_responses r ON r.session_id=s.session_id AND r.user_id=a.user_id WHERE s.incident_id=$1 GROUP BY s.session_id ORDER BY s.created_at DESC LIMIT 20`, [incidentId]),
      this.db.query(`SELECT route_id AS "routeId",route_type AS "routeType",title,origin,destination,waypoints,hazards,distance_m AS "distanceM",eta_seconds AS "etaSeconds",status FROM operational_routes WHERE incident_id=$1 ORDER BY created_at DESC`, [incidentId]),
      this.db.query(`SELECT DISTINCT ON(p.user_id) p.position_id AS "positionId",p.user_id AS "userId",u.name AS "userName",p.floor_id AS "floorId",p.source,p.x_percent AS "xPercent",p.y_percent AS "yPercent",p.latitude,p.longitude,p.accuracy_m AS "accuracyM",p.recorded_at AS "recordedAt" FROM indoor_position_updates p JOIN users u ON u.user_id=p.user_id WHERE p.incident_id=$1 ORDER BY p.user_id,p.recorded_at DESC`, [incidentId]),
      this.db.query(`SELECT zone_id AS "zoneId",name,zone_type AS "zoneType",geometry,status FROM tactical_zones WHERE incident_id=$1 ORDER BY created_at`, [incidentId]),
      this.db.query(`SELECT objective_id AS "objectiveId",zone_id AS "zoneId",title,owner_label AS "ownerLabel",success_criteria AS "successCriteria",priority,status FROM tactical_objectives WHERE incident_id=$1 ORDER BY priority,created_at`, [incidentId]),
      this.db.query(`SELECT hospital_id AS "hospitalId",name,emergency_status AS "emergencyStatus",available_beds AS "availableBeds",specialties,updated_at AS "updatedAt" FROM hospital_capacities ORDER BY name`, []),
      this.db.query(`SELECT h.handover_id AS "handoverId",h.patient_ref AS "patientRef",h.triage_level AS "triageLevel",h.summary,h.status,c.name AS "hospitalName" FROM patient_handovers h LEFT JOIN hospital_capacities c ON c.hospital_id=h.hospital_id WHERE h.incident_id=$1 ORDER BY h.created_at DESC`, [incidentId]),
      this.db.query(`SELECT run_id AS "runId",scenario,result,disclaimer,created_at AS "createdAt" FROM digital_twin_runs WHERE incident_id=$1 ORDER BY created_at DESC LIMIT 10`, [incidentId]),
    ]);
    if (user.role === 'RESPONDER') return { signals: signals.filter((x: any) => x.userId === user.userId || x.status === 'ACTIVE'), par, routes, positions, zones, objectives, hospitals, handovers: [], twinRuns: [] };
    return { signals, par, routes, positions, zones, objectives, hospitals, handovers, twinRuns };
  }

  async mayday(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'MAYDAY');
    const active = await this.db.query(`SELECT signal_id AS "signalId" FROM emergency_signals WHERE incident_id=$1 AND user_id=$2 AND status IN ('ACTIVE','ACKNOWLEDGED') ORDER BY activated_at DESC LIMIT 1`, [incidentId, user.userId]);
    if (active.length) return active[0];
    const row = (await this.db.query(`INSERT INTO emergency_signals(incident_id,user_id,signal_type,trigger_source,location,vitals,audio_ref,last_communication_at) VALUES($1,$2,'MAYDAY','MANUAL',$3::jsonb,$4::jsonb,$5,now()) RETURNING signal_id AS "signalId",status,activated_at AS "activatedAt"`, [incidentId, user.userId, JSON.stringify(body.location ?? {}), JSON.stringify(body.vitals ?? {}), body.audioRef?.trim() || null]))[0];
    await this.alerts.createFromSystem({ incidentId, alertType: 'RISK_WARNING', message: '[MAYDAY] 대원 긴급 구조 요청', sourceType: 'HUMAN', targetUserId: user.userId, automationKey: `mayday:${row.signalId}` });
    return row;
  }

  async maydayStatus(id: string, user: AuthenticatedUser, status: string, note?: string) {
    this.operator(user);
    if (!['ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'].includes(status)) throw new BadRequestException();
    const signal = (await this.db.query(`SELECT incident_id FROM emergency_signals WHERE signal_id=$1`, [id]))[0];
    if (!signal) throw new NotFoundException();
    await this.orgScope.assertIncident(user, signal.incident_id);
    const rows = await this.db.query(`UPDATE emergency_signals SET status=$2::varchar,acknowledged_by=CASE WHEN $2::varchar='ACKNOWLEDGED' THEN $3::uuid ELSE acknowledged_by END,acknowledged_at=CASE WHEN $2::varchar='ACKNOWLEDGED' THEN now() ELSE acknowledged_at END,resolved_by=CASE WHEN $2::varchar IN ('RESOLVED','CANCELLED') THEN $3::uuid ELSE resolved_by END,resolved_at=CASE WHEN $2::varchar IN ('RESOLVED','CANCELLED') THEN now() ELSE resolved_at END,resolution_note=COALESCE($4::text,resolution_note) WHERE signal_id=$1 AND status NOT IN ('RESOLVED','CANCELLED') RETURNING signal_id AS "signalId",status`, [id, status, user.userId, note?.trim() || null]);
    if (!rows.length) throw new NotFoundException();
    return rows[0];
  }

  async startPar(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'PAR_MANAGE');
    const seconds = Number(body.deadlineSeconds ?? 120);
    if (!Number.isInteger(seconds) || seconds < 30 || seconds > 1800) throw new BadRequestException('점검 제한시간은 30~1800초입니다.');
    return (await this.db.query(`INSERT INTO accountability_sessions(incident_id,scope,team_label,deadline_at,created_by) VALUES($1,$2,$3,now()+($4::text||' seconds')::interval,$5) RETURNING session_id AS "sessionId",status,deadline_at AS "deadlineAt"`, [incidentId, body.teamLabel ? 'TEAM' : 'ALL', body.teamLabel?.trim() || null, seconds, user.userId]))[0];
  }

  async respondPar(id: string, user: AuthenticatedUser, body: any) {
    if (!['SAFE', 'NEEDS_HELP'].includes(body.response)) throw new BadRequestException();
    const sessions = await this.db.query(`SELECT incident_id FROM accountability_sessions WHERE session_id=$1 AND status='OPEN' AND deadline_at>now()`, [id]);
    if (!sessions.length) throw new BadRequestException('응답 가능한 인원점검이 아닙니다.');
    await this.orgScope.assertIncident(user, sessions[0].incident_id);
    await this.permission(sessions[0].incident_id, user, 'PAR_RESPOND');
    const row = (await this.db.query(`INSERT INTO accountability_responses(session_id,user_id,response,location) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(session_id,user_id) DO UPDATE SET response=EXCLUDED.response,location=EXCLUDED.location,responded_at=now() RETURNING session_id AS "sessionId",response`, [id, user.userId, body.response, JSON.stringify(body.location ?? {})]))[0];
    if (body.response === 'NEEDS_HELP') await this.mayday(sessions[0].incident_id, user, { location: body.location });
    return row;
  }

  async registerPush(user: AuthenticatedUser, body: any) {
    if (!['WEB', 'FCM', 'APNS'].includes(body.platform) || !body.endpointToken?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO push_subscriptions(user_id,platform,endpoint_token,device_label) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,platform,endpoint_token) DO UPDATE SET active=true,device_label=EXCLUDED.device_label,updated_at=now() RETURNING subscription_id AS "subscriptionId"`, [user.userId, body.platform, body.endpointToken.trim(), body.deviceLabel?.trim() || null]))[0];
  }

  async route(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'ROUTE_MANAGE');
    if (!['DISPATCH', 'ENTRY', 'EVACUATION', 'TRANSPORT'].includes(body.routeType) || !body.title?.trim()) throw new BadRequestException();
    const distance = this.distance(body.origin, body.destination);
    return (await this.db.query(`INSERT INTO operational_routes(incident_id,route_type,title,origin,destination,waypoints,hazards,distance_m,eta_seconds,created_by) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10) RETURNING route_id AS "routeId",status`, [incidentId, body.routeType, body.title.trim(), JSON.stringify(body.origin ?? {}), JSON.stringify(body.destination ?? {}), JSON.stringify(body.waypoints ?? []), JSON.stringify(body.hazards ?? []), distance, distance ? Math.ceil(distance / 8.3) : null, user.userId]))[0];
  }

  private distance(a: any, b: any) {
    if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
    const rad = (x: number) => x * Math.PI / 180;
    const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return Math.round(12742000 * Math.asin(Math.sqrt(h)));
  }

  async position(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'POSITION_REPORT');
    if (!['GPS', 'BLE', 'UWB', 'MANUAL'].includes(body.source)) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO indoor_position_updates(incident_id,user_id,floor_id,source,x_percent,y_percent,latitude,longitude,accuracy_m) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING position_id AS "positionId",recorded_at AS "recordedAt"`, [incidentId, user.userId, body.floorId || null, body.source, body.xPercent ?? null, body.yPercent ?? null, body.latitude ?? null, body.longitude ?? null, body.accuracyM ?? null]))[0];
  }

  async addTag(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!['QR', 'RFID'].includes(body.tagType) || !body.tagValue?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO resource_tags(resource_id,tag_type,tag_value,expires_at) VALUES($1,$2,$3,$4) RETURNING tag_id AS "tagId",lifecycle_status AS "lifecycleStatus"`, [body.resourceId, body.tagType, body.tagValue.trim(), body.expiresAt || null]))[0];
  }

  async scanTag(user: AuthenticatedUser, tagValue: string, body: any) {
    if (!['AVAILABLE', 'DEPLOYED', 'MAINTENANCE', 'LOST', 'RETIRED'].includes(body.status)) throw new BadRequestException();
    const rows = await this.db.query(`UPDATE resource_tags SET lifecycle_status=$2,last_incident_id=$3,last_scanned_by=$4,last_scanned_at=now() WHERE tag_value=$1 RETURNING tag_id AS "tagId",resource_id AS "resourceId",lifecycle_status AS "lifecycleStatus"`, [tagValue, body.status, body.incidentId || null, user.userId]);
    if (!rows.length) throw new NotFoundException();
    return rows[0];
  }

  async hospital(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.name?.trim() || !['AVAILABLE', 'LIMITED', 'FULL', 'DIVERT', 'UNKNOWN'].includes(body.emergencyStatus)) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO hospital_capacities(name,external_ref,latitude,longitude,emergency_status,available_beds,specialties,source) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(external_ref) DO UPDATE SET emergency_status=EXCLUDED.emergency_status,available_beds=EXCLUDED.available_beds,specialties=EXCLUDED.specialties,updated_at=now() RETURNING hospital_id AS "hospitalId"`, [body.name.trim(), body.externalRef || null, body.latitude ?? null, body.longitude ?? null, body.emergencyStatus, body.availableBeds ?? null, JSON.stringify(body.specialties ?? []), body.source || 'MANUAL']))[0];
  }

  async handover(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'HANDOVER_MANAGE');
    if (!body.patientRef?.trim() || !body.summary?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO patient_handovers(incident_id,hospital_id,patient_ref,triage_level,summary,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING handover_id AS "handoverId",status`, [incidentId, body.hospitalId || null, body.patientRef.trim(), body.triageLevel || null, body.summary.trim(), user.userId]))[0];
  }

  async zone(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'TACTICAL_BOARD');
    if (!body.name?.trim() || !['HOT', 'WARM', 'COLD', 'STAGING', 'TRIAGE'].includes(body.zoneType)) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO tactical_zones(incident_id,name,zone_type,geometry,created_by) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING zone_id AS "zoneId"`, [incidentId, body.name.trim(), body.zoneType, JSON.stringify(body.geometry ?? {}), user.userId]))[0];
  }

  async objective(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'TACTICAL_BOARD');
    if (!body.title?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO tactical_objectives(incident_id,zone_id,title,owner_label,success_criteria,priority,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING objective_id AS "objectiveId",status`, [incidentId, body.zoneId || null, body.title.trim(), body.ownerLabel?.trim() || null, body.successCriteria?.trim() || null, body.priority ?? 3, user.userId]))[0];
  }

  async objectiveStatus(id: string, user: AuthenticatedUser, status: string) {
    this.operator(user);
    if (!['OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'].includes(status)) throw new BadRequestException();
    const objective = (await this.db.query(`SELECT incident_id FROM tactical_objectives WHERE objective_id=$1`, [id]))[0];
    if (!objective) throw new NotFoundException();
    await this.orgScope.assertIncident(user, objective.incident_id);
    const rows = await this.db.query(`UPDATE tactical_objectives SET status=$2,updated_at=now() WHERE objective_id=$1 RETURNING objective_id AS "objectiveId",status`, [id, status]);
    if (!rows.length) throw new NotFoundException();
    return rows[0];
  }

  async afterAction(incidentId: string, user: AuthenticatedUser) {
    this.operator(user);
    const counts = await this.db.query(`SELECT COUNT(*)::int AS "eventCount",MIN(occurred_at) AS "startedAt",MAX(occurred_at) AS "endedAt" FROM incident_events WHERE incident_id=$1`, [incidentId]);
    const delays = await this.db.query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(d.acknowledged_at,now())-d.queued_at))),0)::int AS "averageAckSeconds",COUNT(*) FILTER(WHERE d.acknowledged_at IS NULL)::int AS "unacknowledged" FROM alert_deliveries d JOIN alerts a ON a.alert_id=d.alert_id WHERE a.incident_id=$1`, [incidentId]);
    const missingSop = await this.db.query(`SELECT COUNT(*) FILTER(WHERE required AND status<>'COMPLETED')::int AS "incompleteRequiredSop" FROM incident_sop_items WHERE incident_id=$1`, [incidentId]);
    const maydays = await this.db.query(`SELECT COUNT(*)::int AS "maydayCount" FROM emergency_signals WHERE incident_id=$1`, [incidentId]);
    const summary = { ...counts[0], ...delays[0], ...missingSop[0], ...maydays[0] };
    const recommendations = [];
    if (summary.unacknowledged) recommendations.push('미확인 경보의 통신 경로와 담당자를 검토하세요.');
    if (summary.incompleteRequiredSop) recommendations.push('완료하지 못한 필수 SOP의 원인을 검토하세요.');
    if (summary.maydayCount) recommendations.push('MAYDAY 발생 구간의 위치·통신·지휘 기록을 재검토하세요.');
    return (await this.db.query(`INSERT INTO after_action_reports(incident_id,summary,recommendations,generated_by) VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT(incident_id) DO UPDATE SET summary=EXCLUDED.summary,recommendations=EXCLUDED.recommendations,generated_by=EXCLUDED.generated_by,generated_at=now() RETURNING report_id AS "reportId",summary,recommendations,generated_at AS "generatedAt"`, [incidentId, JSON.stringify(summary), JSON.stringify(recommendations), user.userId]))[0];
  }

  async trainingFromIncident(incidentId: string, user: AuthenticatedUser, title?: string) {
    this.operator(user);
    const rows = await this.db.query(`SELECT incident_type FROM incidents WHERE incident_id=$1`, [incidentId]);
    if (!rows.length) throw new NotFoundException();
    const scenario = ['FIRE', 'RESCUE'].includes(rows[0].incident_type) ? rows[0].incident_type : 'COMMUNICATION_LOSS';
    return (await this.db.query(`INSERT INTO training_sessions(title,scenario,created_by,source_incident_id) VALUES($1,$2,$3,$4) RETURNING training_id AS "trainingId",title,scenario,status`, [title?.trim() || `사건 ${incidentId.slice(0, 8)} 재현 훈련`, scenario, user.userId, incidentId]))[0];
  }

  async drift(user: AuthenticatedUser, modelName = 'fire-detection') {
    this.operator(user);
    const rows = await this.db.query(`SELECT COUNT(*)::int AS samples,COUNT(*) FILTER(WHERE f.verdict='FALSE_POSITIVE')::int AS fp,COUNT(*) FILTER(WHERE f.verdict='FALSE_NEGATIVE')::int AS fn FROM ai_judgment_feedback f WHERE f.reviewed_at>=now()-interval '7 days'`);
    const sample = rows[0], count = Number(sample.samples);
    const fp = count ? Number(sample.fp) / count : null, fn = count ? Number(sample.fn) / count : null;
    const status = count < 20 ? 'INSUFFICIENT_DATA' : Math.max(fp ?? 0, fn ?? 0) >= 0.25 ? 'DRIFTED' : Math.max(fp ?? 0, fn ?? 0) >= 0.15 ? 'WATCH' : 'STABLE';
    return (await this.db.query(`INSERT INTO ai_drift_snapshots(model_name,window_start,window_end,sample_count,false_positive_rate,false_negative_rate,unknown_rate,drift_status,details) VALUES($1,now()-interval '7 days',now(),$2,$3,$4,NULL,$5,$6::jsonb) ON CONFLICT(model_name,window_start,window_end) DO NOTHING RETURNING snapshot_id AS "snapshotId",sample_count AS "sampleCount",false_positive_rate AS "falsePositiveRate",false_negative_rate AS "falseNegativeRate",drift_status AS "driftStatus"`, [modelName, count, fp, fn, status, JSON.stringify({ threshold: { watch: 0.15, drifted: 0.25 } })]))[0] ?? { sampleCount: count, falsePositiveRate: fp, falseNegativeRate: fn, driftStatus: status };
  }

  async twin(incidentId: string, user: AuthenticatedUser, body: any) {
    await this.permission(incidentId, user, 'TACTICAL_BOARD');
    if (!['SMOKE', 'HEAT', 'EVACUATION'].includes(body.scenario)) throw new BadRequestException();
    const elapsed = Math.max(0, Math.min(3600, Number(body.inputs?.elapsedSeconds ?? 300)));
    const wind = Math.max(0, Math.min(30, Number(body.inputs?.windMps ?? 1)));
    const result = { estimatedRadiusM: Math.round(Math.sqrt(elapsed) * (1 + wind / 10) * 2), confidence: 'SIMULATION_ONLY', generatedAt: new Date().toISOString() };
    const disclaimer = '단순 운영 훈련용 추정치이며 실제 연기·열·대피 안전 판단에 사용할 수 없습니다.';
    return (await this.db.query(`INSERT INTO digital_twin_runs(incident_id,floor_id,scenario,inputs,result,disclaimer,created_by) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) RETURNING run_id AS "runId",result,disclaimer`, [incidentId, body.floorId || null, body.scenario, JSON.stringify(body.inputs ?? {}), JSON.stringify(result), disclaimer, user.userId]))[0];
  }

  async metrics(user: AuthenticatedUser) {
    this.operator(user);
    const jobs = await this.db.query(`SELECT COUNT(*) FILTER(WHERE status IN ('PENDING','PROCESSING'))::int AS "queuedJobs",COUNT(*) FILTER(WHERE status IN ('FAILED','DEAD'))::int AS "failedJobs" FROM durable_jobs`);
    const signals = await this.db.query(`SELECT COUNT(*) FILTER(WHERE status IN ('ACTIVE','ACKNOWLEDGED'))::int AS "activeMaydays" FROM emergency_signals`);
    const par = await this.db.query(`SELECT COUNT(*) FILTER(WHERE status='OPEN' AND deadline_at<now())::int AS "expiredPar" FROM accountability_sessions`);
    const latency = await this.db.query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (received_at-queued_at))*1000),0)::int AS "averageDeliveryMs" FROM alert_deliveries WHERE received_at IS NOT NULL AND queued_at>=now()-interval '24 hours'`);
    const drift = await this.db.query(`SELECT drift_status AS "driftStatus",sample_count AS "sampleCount",created_at AS "createdAt" FROM ai_drift_snapshots ORDER BY created_at DESC LIMIT 1`);
    const recovery = await this.db.query(`SELECT restore_verified AS "restoreVerified",created_at AS "createdAt",verified_at AS "verifiedAt" FROM recovery_checkpoints ORDER BY created_at DESC LIMIT 1`);
    return { ...jobs[0], ...signals[0], ...par[0], ...latency[0], latestDrift: drift[0] ?? null, latestRecovery: recovery[0] ?? null, uptimeSeconds: Math.round(process.uptime()) };
  }

  async prometheus(user: AuthenticatedUser) {
    const m = await this.metrics(user);
    return [
      '# HELP dispatchmate_durable_jobs Number of durable delivery jobs.',
      '# TYPE dispatchmate_durable_jobs gauge',
      `dispatchmate_durable_jobs{state="queued"} ${m.queuedJobs}`,
      `dispatchmate_durable_jobs{state="failed"} ${m.failedJobs}`,
      '# HELP dispatchmate_active_maydays Active or acknowledged emergency signals.',
      '# TYPE dispatchmate_active_maydays gauge',
      `dispatchmate_active_maydays ${m.activeMaydays}`,
      '# HELP dispatchmate_expired_par Expired personnel accountability sessions.',
      '# TYPE dispatchmate_expired_par gauge',
      `dispatchmate_expired_par ${m.expiredPar}`,
      '# HELP dispatchmate_alert_delivery_milliseconds Average app delivery latency over 24 hours.',
      '# TYPE dispatchmate_alert_delivery_milliseconds gauge',
      `dispatchmate_alert_delivery_milliseconds ${m.averageDeliveryMs}`,
      '# HELP dispatchmate_process_uptime_seconds Notification process uptime.',
      '# TYPE dispatchmate_process_uptime_seconds gauge',
      `dispatchmate_process_uptime_seconds ${m.uptimeSeconds}`,
      '',
    ].join('\n');
  }

  async recoveryPolicy(user: AuthenticatedUser, body: any) {
    this.admin(user);
    if (!body.name?.trim() || !body.scheduleCron?.trim()) throw new BadRequestException();
    return (await this.db.query(`INSERT INTO recovery_policies(name,schedule_cron,retention_days,rpo_minutes,rto_minutes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING policy_id AS "policyId"`, [body.name.trim(), body.scheduleCron.trim(), body.retentionDays, body.rpoMinutes, body.rtoMinutes, user.userId]))[0];
  }

  gateway(kind: string) {
    return this.config.get<string>(`${kind}_GATEWAY_URL`);
  }
}

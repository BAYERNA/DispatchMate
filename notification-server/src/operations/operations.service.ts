import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from '../alerts/entities/alert.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { OrganizationScopeService } from '../common/organization-scope/organization-scope.service';
@Injectable()
export class OperationsService {
  constructor(@InjectRepository(Alert) private readonly db: Repository<Alert>, private readonly orgScope: OrganizationScopeService) {}
  private operator(user: AuthenticatedUser) { if (!['ADMIN','COMMANDER'].includes(user.role)) throw new ForbiddenException(); }
  timeline(incidentId:string,user:AuthenticatedUser) { this.operator(user); return this.db.query(`SELECT e.event_id AS "eventId",e.event_type AS "eventType",
    e.actor_user_id AS "actorUserId",u.name AS "actorName",e.source_ref AS "sourceRef",e.summary,e.details,
    e.occurred_at AS "occurredAt" FROM incident_events e LEFT JOIN users u ON u.user_id=e.actor_user_id
    WHERE e.incident_id=$1 ORDER BY e.occurred_at DESC,e.event_id DESC LIMIT 500`,[incidentId]); }
  async map(incidentId:string,user:AuthenticatedUser) {
    this.operator(user);
    const incidents=await this.db.query(`SELECT incident_id AS "incidentId",address,latitude,longitude FROM incidents WHERE incident_id=$1`,[incidentId]);
    if(!incidents.length) throw new NotFoundException();
    const devices=await this.db.query(`SELECT d.device_id AS "deviceId",d.serial_no AS "serialNo",d.device_type AS "deviceType",
      d.current_user_id AS "userId",u.name AS "userName",d.latitude,d.longitude,d.status,d.battery_level AS "batteryLevel"
      FROM devices d LEFT JOIN users u ON u.user_id=d.current_user_id
      LEFT JOIN incident_assignments a ON a.user_id=d.current_user_id AND a.incident_id=$1
      WHERE (a.assignment_id IS NOT NULL OR d.device_type IN ('CCTV','DRONE'))
      AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL ORDER BY d.device_type,d.serial_no`,[incidentId]);
    return {incident:incidents[0],devices};
  }
  trainingList(user:AuthenticatedUser) { this.operator(user); return this.db.query(`SELECT t.training_id AS "trainingId",t.title,t.scenario,t.status,
    t.created_by AS "createdBy",u.name AS "createdByName",t.started_at AS "startedAt",t.completed_at AS "completedAt",t.created_at AS "createdAt",
    COALESCE(jsonb_agg(jsonb_build_object('eventId',e.training_event_id,'eventType',e.event_type,'note',e.note,'occurredAt',e.occurred_at)
    ORDER BY e.occurred_at) FILTER(WHERE e.training_event_id IS NOT NULL),'[]'::jsonb) AS events
    FROM training_sessions t JOIN users u ON u.user_id=t.created_by LEFT JOIN training_events e ON e.training_id=t.training_id
    GROUP BY t.training_id,u.name ORDER BY t.created_at DESC`); }
  async createTraining(user:AuthenticatedUser,title:string,scenario:string) {
    this.operator(user);
    if(!title?.trim()||!['FIRE','RESCUE','HAZMAT','COMMUNICATION_LOSS'].includes(scenario)) throw new BadRequestException('훈련명과 시나리오를 확인하세요.');
    return (await this.db.query(`INSERT INTO training_sessions(title,scenario,created_by) VALUES($1,$2,$3)
      RETURNING training_id AS "trainingId",title,scenario,status,created_at AS "createdAt"`,[title.trim(),scenario,user.userId]))[0];
  }
  async trainingAction(id:string,user:AuthenticatedUser,action:string,note?:string) {
    this.operator(user);
    if(action==='EVENT') {
      if(!note?.trim()) throw new BadRequestException('훈련 이벤트 내용을 입력하세요.');
      const rows=await this.db.query(`INSERT INTO training_events(training_id,event_type,note,created_by)
        SELECT $1,'INJECT',$2,$3 FROM training_sessions WHERE training_id=$1 AND status='RUNNING'
        RETURNING training_event_id AS "eventId",event_type AS "eventType",note,occurred_at AS "occurredAt"`,[id,note.trim(),user.userId]);
      if(!rows.length) throw new BadRequestException('진행 중인 훈련에만 이벤트를 추가할 수 있습니다.');
      return rows[0];
    }
    const transitions:Record<string,[string,string,string]>={START:['READY','RUNNING','started_at'],COMPLETE:['RUNNING','COMPLETED','completed_at'],CANCEL:['READY','CANCELLED','completed_at']};
    const transition=transitions[action]; if(!transition) throw new BadRequestException();
    const rows=await this.db.query(`UPDATE training_sessions SET status=$2, ${transition[2]}=now() WHERE training_id=$1 AND status=$3
      RETURNING training_id AS "trainingId",status`,[id,transition[1],transition[0]]);
    if(!rows.length) throw new BadRequestException('현재 상태에서 수행할 수 없는 훈련 작업입니다.');
    return rows[0];
  }
  async feedback(judgmentId:string,user:AuthenticatedUser,verdict:string,note?:string) {
    this.operator(user); if(!['CORRECT','FALSE_POSITIVE','FALSE_NEGATIVE','UNSURE'].includes(verdict)) throw new BadRequestException('판정값을 확인하세요.');
    const judgment=(await this.db.query(`SELECT related_incident_id FROM ai_judgment_logs WHERE judgment_id=$1`,[judgmentId]))[0];
    if(!judgment) throw new NotFoundException();
    if(judgment.related_incident_id) await this.orgScope.assertIncident(user,judgment.related_incident_id);
    const rows=await this.db.query(`INSERT INTO ai_judgment_feedback(judgment_id,verdict,note,reviewed_by)
      SELECT judgment_id,$2,$3,$4 FROM ai_judgment_logs WHERE judgment_id=$1 ON CONFLICT(judgment_id) DO UPDATE
      SET verdict=EXCLUDED.verdict,note=EXCLUDED.note,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=now()
      RETURNING judgment_id AS "judgmentId",verdict,note,reviewed_by AS "reviewedBy",reviewed_at AS "reviewedAt"`,
      [judgmentId,verdict,note?.trim()||null,user.userId]); if(!rows.length) throw new NotFoundException(); return rows[0];
  }
  // 정확도(correctPercent)는 이미 있었지만, "오탐 중 몇 %가 진짜 정탐이었나(precision)"·
  // "실제 맞아야 할 것 중 몇 %를 잡았나(recall)"는 따로 계산돼 있지 않았다 — CORRECT를 진양성,
  // FALSE_POSITIVE/FALSE_NEGATIVE를 그대로 위양성/위음성으로 봐서 표준 정의대로 계산한다.
  // UNSURE는 분모에서 제외(판단 보류 표본은 정밀도·재현율 어느 쪽으로도 셀 수 없음).
  feedbackStats(user:AuthenticatedUser) { this.operator(user); return this.db.query(`SELECT count(*)::int AS "reviewedCount",
    count(*) FILTER(WHERE verdict='CORRECT')::int AS "correctCount",
    count(*) FILTER(WHERE verdict='FALSE_POSITIVE')::int AS "falsePositiveCount",
    count(*) FILTER(WHERE verdict='FALSE_NEGATIVE')::int AS "falseNegativeCount",
    (CASE WHEN count(*)=0 THEN NULL ELSE round(100.0*count(*) FILTER(WHERE verdict='CORRECT')/count(*),1) END)::float8 AS "correctPercent",
    (CASE WHEN count(*) FILTER(WHERE verdict IN ('CORRECT','FALSE_POSITIVE'))=0 THEN NULL
      ELSE round(100.0*count(*) FILTER(WHERE verdict='CORRECT')/count(*) FILTER(WHERE verdict IN ('CORRECT','FALSE_POSITIVE')),1) END)::float8 AS "precisionPercent",
    (CASE WHEN count(*) FILTER(WHERE verdict IN ('CORRECT','FALSE_NEGATIVE'))=0 THEN NULL
      ELSE round(100.0*count(*) FILTER(WHERE verdict='CORRECT')/count(*) FILTER(WHERE verdict IN ('CORRECT','FALSE_NEGATIVE')),1) END)::float8 AS "recallPercent"
    FROM ai_judgment_feedback`).then((rows:any[])=>{
      const r=rows[0];
      const precision=r.precisionPercent, recall=r.recallPercent;
      r.f1ScorePercent=(precision==null||recall==null||precision+recall===0)?null:Math.round(2*precision*recall/(precision+recall)*10)/10;
      return [r];
    }); }
}

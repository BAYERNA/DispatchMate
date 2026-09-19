import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

// DB설계서 §3.5 incident_assignments. 테이블은 backend(Java) Flyway 마이그레이션(V1)이 소유·생성한다.
// alert.entity.ts와 동일한 타협 — 물리적으로 같은 Postgres 인스턴스를 공유하되 스키마 소유권은
// Java 쪽에 둔다. AlertsGateway가 incident:{id} 룸 join 시 RESPONDER의 배정 여부를 검증하는
// 용도로만 읽는다(쓰기는 하지 않는다).
@Entity({ name: 'incident_assignments' })
export class IncidentAssignment {
  @PrimaryGeneratedColumn('uuid', { name: 'assignment_id' })
  assignmentId: string

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string

  @Column({ name: 'is_comms_lead', type: 'boolean' })
  isCommsLead: boolean
}

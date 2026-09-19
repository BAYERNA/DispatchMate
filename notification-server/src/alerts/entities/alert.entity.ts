import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// DB설계서 §3.7 alerts. 테이블은 backend(Java) Flyway 마이그레이션(V1)이 소유·생성한다.
// notification-server는 synchronize:false로 이 스키마에 매핑만 하고, 스키마 변경 권한은 없다
// (인프라 다이어그램 "서비스별 스키마 분리" — 물리적으로는 같은 Postgres 인스턴스를 공유하는
// 데모 규모의 타협이지만, 소유권만은 도메인별로 분리해 둔다).
export type AlertType = 'RISK_WARNING' | 'EVACUATION' | 'STATUS_CHANGE' | 'ENTRY_INFO' | 'SUPPLY_REQUEST';
export type InfoCategory = 'ENTRY' | 'HAZARD';
export type StatusTag = 'PASSABLE' | 'BLOCKED' | 'DANGER';
export type SourceType = 'HUMAN' | 'SENSOR' | 'AI' | 'EXTERNAL';
export type Channel = 'VOICE' | 'TEXT';

@Entity({ name: 'alerts' })
export class Alert {
  @PrimaryGeneratedColumn('uuid', { name: 'alert_id' })
  alertId: string;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId: string | null;

  @Column({ name: 'author_id', type: 'uuid', nullable: true })
  authorId: string | null;

  @Column({ name: 'alert_type', type: 'varchar', length: 20, nullable: true })
  alertType: AlertType | null;

  @Column({ name: 'info_category', type: 'varchar', length: 20, nullable: true })
  infoCategory: InfoCategory | null;

  @Column({ name: 'location_label', type: 'varchar', length: 50, nullable: true })
  locationLabel: string | null;

  @Column({ name: 'status_tag', type: 'varchar', length: 20, nullable: true })
  statusTag: StatusTag | null;

  @Column({ name: 'requested_items', type: 'jsonb', nullable: true })
  requestedItems: { item: string; qty: number }[] | null;

  @Column({ name: 'source_type', type: 'varchar', length: 20, default: 'HUMAN' })
  sourceType: SourceType;

  @Column({ type: 'varchar', length: 10, nullable: true })
  channel: Channel | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamp' })
  sentAt: Date;

  // Phase 7 FR-22 에스컬레이션(V5 마이그레이션). 재알림을 이미 한 번 보냈으면 채워지고,
  // 그 뒤로는 이 alert를 다시 에스컬레이션 대상에서 제외한다.
  @Column({ name: 'escalated_at', type: 'timestamp', nullable: true })
  escalatedAt: Date | null;

  @Column({ name: 'escalation_of', type: 'uuid', nullable: true })
  escalationOf: string | null;

  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId: string | null;
}

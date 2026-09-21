import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';

@Injectable()
export class DeliveryService {
  constructor(@InjectRepository(Alert) private readonly alerts: Repository<Alert>) {}

  async receive(incidentId: string, user: AuthenticatedUser, alertIds: string[]): Promise<void> {
    // The authenticated identity is the only identity allowed to record receipt.
    // Assignment/session are rechecked by the controller guards on every retry.
    await this.alerts.query(`UPDATE alert_deliveries d
      SET received_at = COALESCE(d.received_at, now())
      FROM alerts a WHERE a.alert_id = d.alert_id AND a.incident_id = $1
      AND d.user_id = $2 AND d.alert_id = ANY($3::uuid[])
      AND (a.target_user_id IS NULL OR a.target_user_id = $2)`, [incidentId, user.userId, alertIds]);
  }

  async status(incidentId: string, user: AuthenticatedUser) {
    if (!['ADMIN', 'COMMANDER'].includes(user.role)) throw new ForbiddenException();
    return this.alerts.query(`SELECT a.alert_id AS "alertId", a.delivery_tracking AS "tracked",
      COALESCE(jsonb_agg(jsonb_build_object(
        'userId', d.user_id, 'name', u.name, 'queuedAt', d.queued_at,
        'receivedAt', d.received_at, 'acknowledgedAt', d.acknowledged_at
      ) ORDER BY u.name, d.user_id) FILTER (WHERE d.user_id IS NOT NULL), '[]'::jsonb) AS recipients
      FROM alerts a LEFT JOIN alert_deliveries d ON d.alert_id = a.alert_id
      LEFT JOIN users u ON u.user_id = d.user_id
      WHERE a.incident_id = $1 GROUP BY a.alert_id ORDER BY a.sent_at DESC`, [incidentId]);
  }
}

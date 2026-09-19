ALTER TABLE users ADD COLUMN token_version bigint NOT NULL DEFAULT 0;
ALTER TABLE alerts ADD COLUMN escalation_of uuid REFERENCES alerts(alert_id);
CREATE UNIQUE INDEX uq_alert_escalation_of ON alerts(escalation_of) WHERE escalation_of IS NOT NULL;

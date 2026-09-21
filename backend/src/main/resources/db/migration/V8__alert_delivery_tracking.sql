-- Historical alerts have no reliable recipient snapshot; never invent delivery history.
ALTER TABLE alerts ADD COLUMN delivery_tracking BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alerts ALTER COLUMN delivery_tracking SET DEFAULT true;

CREATE TABLE alert_deliveries (
    alert_id UUID NOT NULL REFERENCES alerts(alert_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),
    queued_at TIMESTAMP NOT NULL DEFAULT now(),
    received_at TIMESTAMP,
    acknowledged_at TIMESTAMP,
    PRIMARY KEY (alert_id, user_id),
    CHECK (acknowledged_at IS NULL OR received_at IS NOT NULL)
);
CREATE INDEX idx_alert_deliveries_user ON alert_deliveries(user_id, alert_id);

-- Snapshot and alert commit together, including alerts written by other services.
CREATE FUNCTION snapshot_alert_recipients() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO alert_deliveries(alert_id, user_id, queued_at)
    SELECT NEW.alert_id, a.user_id, NEW.sent_at
    FROM incident_assignments a JOIN users u ON u.user_id = a.user_id
    WHERE a.incident_id = NEW.incident_id AND u.role = 'RESPONDER' AND u.status = 'ACTIVE'
      AND (NEW.target_user_id IS NULL OR a.user_id = NEW.target_user_id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_alert_recipients AFTER INSERT ON alerts
    FOR EACH ROW EXECUTE FUNCTION snapshot_alert_recipients();

CREATE FUNCTION record_alert_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE alert_deliveries
    SET received_at = COALESCE(received_at, NEW.acknowledged_at),
        acknowledged_at = COALESCE(acknowledged_at, NEW.acknowledged_at)
    WHERE alert_id = NEW.alert_id AND user_id = NEW.user_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER record_alert_confirmation AFTER INSERT ON alert_acknowledgements
    FOR EACH ROW EXECUTE FUNCTION record_alert_confirmation();

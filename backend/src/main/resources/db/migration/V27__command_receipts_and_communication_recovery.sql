-- DispatchMate V27: per-responder command lifecycle and communication recovery state.

ALTER TABLE incident_commands
  ADD COLUMN acknowledgement_due_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds');

CREATE TABLE incident_command_receipts (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL REFERENCES incident_commands(command_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','RECEIVED','READ','ACCEPTED','REJECTED','COMPLETED')),
  received_at timestamptz,
  read_at timestamptz,
  responded_at timestamptz,
  completed_at timestamptz,
  escalated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(command_id,user_id)
);

CREATE INDEX idx_command_receipts_pending
  ON incident_command_receipts(status,updated_at)
  WHERE status IN ('PENDING','RECEIVED','READ');

CREATE FUNCTION seed_command_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO incident_command_receipts(command_id,user_id)
  SELECT NEW.command_id,a.user_id
  FROM incident_assignments a JOIN users u ON u.user_id=a.user_id
  WHERE a.incident_id=NEW.incident_id AND u.role='RESPONDER' AND u.status='ACTIVE'
    AND (NEW.assignee_id IS NULL OR a.user_id=NEW.assignee_id)
  ON CONFLICT(command_id,user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER seed_receipts_after_command
  AFTER INSERT ON incident_commands FOR EACH ROW EXECUTE FUNCTION seed_command_receipts();

INSERT INTO incident_command_receipts(command_id,user_id,status,received_at,read_at,responded_at,completed_at)
SELECT c.command_id,a.user_id,
  CASE c.status WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'ACKNOWLEDGED' THEN 'ACCEPTED' ELSE 'PENDING' END,
  CASE WHEN c.status IN ('ACKNOWLEDGED','COMPLETED') THEN c.updated_at END,
  CASE WHEN c.status IN ('ACKNOWLEDGED','COMPLETED') THEN c.updated_at END,
  CASE WHEN c.status IN ('ACKNOWLEDGED','COMPLETED') THEN c.updated_at END,
  CASE WHEN c.status='COMPLETED' THEN c.updated_at END
FROM incident_commands c JOIN incident_assignments a ON a.incident_id=c.incident_id
JOIN users u ON u.user_id=a.user_id
WHERE u.role='RESPONDER' AND u.status='ACTIVE' AND (c.assignee_id IS NULL OR c.assignee_id=a.user_id)
ON CONFLICT(command_id,user_id) DO NOTHING;

ALTER TABLE incident_communication_heartbeats
  ADD COLUMN stable_state varchar(20) NOT NULL DEFAULT 'DEGRADED'
    CHECK(stable_state IN ('CONNECTED','DEGRADED','OFFLINE','RECOVERING')),
  ADD COLUMN consecutive_healthy smallint NOT NULL DEFAULT 0 CHECK(consecutive_healthy>=0),
  ADD COLUMN consecutive_unhealthy smallint NOT NULL DEFAULT 0 CHECK(consecutive_unhealthy>=0);

UPDATE incident_communication_heartbeats SET stable_state=reported_state,
  consecutive_healthy=CASE WHEN reported_state='CONNECTED' THEN 1 ELSE 0 END,
  consecutive_unhealthy=CASE WHEN reported_state='CONNECTED' THEN 0 ELSE 1 END;

ALTER TABLE safety_alert_state ADD COLUMN resolved_at timestamptz;

CREATE FUNCTION append_command_receipt_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_incident uuid; v_title text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT incident_id,title INTO v_incident,v_title FROM incident_commands WHERE command_id=NEW.command_id;
    INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary,details)
    VALUES(v_incident,'COMMAND_RECEIPT_'||NEW.status,NEW.user_id,NEW.receipt_id::text,
      v_title||' · '||NEW.status,jsonb_build_object('commandId',NEW.command_id,'userId',NEW.user_id));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER audit_command_receipt
  AFTER UPDATE OF status ON incident_command_receipts FOR EACH ROW
  WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_command_receipt_event();

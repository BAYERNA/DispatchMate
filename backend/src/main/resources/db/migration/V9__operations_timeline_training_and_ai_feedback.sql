ALTER TABLE alerts ADD COLUMN client_request_id UUID;
CREATE UNIQUE INDEX uq_alerts_author_client_request
    ON alerts(author_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE incident_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    actor_user_id UUID REFERENCES users(user_id),
    source_ref VARCHAR(120),
    summary TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_events_timeline ON incident_events(incident_id, occurred_at, event_id);
CREATE TABLE training_sessions (
    training_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(120) NOT NULL,
    scenario VARCHAR(40) NOT NULL CHECK (scenario IN ('FIRE','RESCUE','HAZMAT','COMMUNICATION_LOSS')),
    status VARCHAR(15) NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','RUNNING','COMPLETED','CANCELLED')),
    created_by UUID NOT NULL REFERENCES users(user_id), started_at TIMESTAMP, completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE training_events (
    training_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    training_id UUID NOT NULL REFERENCES training_sessions(training_id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL, note TEXT NOT NULL, created_by UUID NOT NULL REFERENCES users(user_id),
    occurred_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE ai_judgment_feedback (
    judgment_id UUID PRIMARY KEY REFERENCES ai_judgment_logs(judgment_id) ON DELETE CASCADE,
    verdict VARCHAR(20) NOT NULL CHECK (verdict IN ('CORRECT','FALSE_POSITIVE','FALSE_NEGATIVE','UNSURE')),
    note TEXT, reviewed_by UUID NOT NULL REFERENCES users(user_id), reviewed_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE FUNCTION append_incident_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_incident UUID; v_actor UUID; v_ref TEXT; v_type TEXT; v_summary TEXT;
BEGIN
    IF TG_TABLE_NAME = 'alerts' THEN
        v_incident := NEW.incident_id; v_actor := NEW.author_id; v_ref := NEW.alert_id::text;
        v_type := 'ALERT_CREATED'; v_summary := COALESCE(NEW.message, NEW.alert_type, '알림 생성');
    ELSIF TG_TABLE_NAME = 'alert_acknowledgements' THEN
        SELECT incident_id INTO v_incident FROM alerts WHERE alert_id = NEW.alert_id;
        v_actor := NEW.user_id; v_ref := NEW.ack_id::text; v_type := 'ALERT_ACKNOWLEDGED'; v_summary := '알림 확인';
    ELSIF TG_TABLE_NAME = 'incident_assignments' THEN
        v_incident := NEW.incident_id; v_actor := NULL; v_ref := NEW.assignment_id::text;
        IF TG_OP = 'INSERT' THEN v_type := 'RESPONDER_ASSIGNED'; v_summary := '대원 배정';
        ELSE v_type := 'ASSIGNMENT_CHANGED'; v_summary := '대원 역할 변경'; END IF;
    ELSIF TG_TABLE_NAME = 'responder_status_logs' THEN
        v_incident := NEW.incident_id; v_actor := NEW.user_id; v_ref := NEW.log_id::text;
        v_type := 'RESPONDER_STATUS'; v_summary := COALESCE(NEW.risk_level, '상태') || ' / ' || COALESCE(NEW.connection_status, '연결정보 없음');
    ELSIF TG_TABLE_NAME = 'ai_judgment_logs' THEN
        v_incident := NEW.related_incident_id; v_ref := NEW.judgment_id::text;
        v_type := 'AI_JUDGMENT'; v_summary := COALESCE(NEW.summary, NEW.judgment_type);
    ELSIF TG_TABLE_NAME = 'incidents' THEN
        v_incident := NEW.incident_id; v_actor := NULL; v_ref := NEW.incident_id::text;
        v_type := 'INCIDENT_STATUS_CHANGED'; v_summary := OLD.status || ' → ' || NEW.status;
    END IF;
    IF v_incident IS NOT NULL THEN
        INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary)
        VALUES(v_incident,v_type,v_actor,v_ref,v_summary);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER audit_alert AFTER INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION append_incident_event();
CREATE TRIGGER audit_ack AFTER INSERT ON alert_acknowledgements FOR EACH ROW EXECUTE FUNCTION append_incident_event();
CREATE TRIGGER audit_assignment AFTER INSERT ON incident_assignments FOR EACH ROW EXECUTE FUNCTION append_incident_event();
CREATE TRIGGER audit_assignment_update AFTER UPDATE OF role_in_incident,is_comms_lead ON incident_assignments FOR EACH ROW EXECUTE FUNCTION append_incident_event();
CREATE TRIGGER audit_responder_status AFTER INSERT ON responder_status_logs FOR EACH ROW EXECUTE FUNCTION append_incident_event();
CREATE TRIGGER audit_ai_judgment AFTER INSERT ON ai_judgment_logs FOR EACH ROW EXECUTE FUNCTION append_incident_event();
CREATE TRIGGER audit_incident_status AFTER UPDATE OF status ON incidents FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_incident_event();
INSERT INTO incident_events(incident_id,event_type,source_ref,summary,occurred_at)
SELECT incident_id,'INCIDENT_CREATED',incident_id::text,'출동 생성',created_at FROM incidents;
INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary,occurred_at)
SELECT incident_id,'ALERT_CREATED',author_id,alert_id::text,COALESCE(message,alert_type,'알림 생성'),sent_at FROM alerts;
INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary,occurred_at)
SELECT a.incident_id,'ALERT_ACKNOWLEDGED',k.user_id,k.ack_id::text,'알림 확인',k.acknowledged_at
FROM alert_acknowledgements k JOIN alerts a ON a.alert_id=k.alert_id;
INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary,occurred_at)
SELECT incident_id,'RESPONDER_ASSIGNED',NULL,assignment_id::text,'대원 배정',assigned_at FROM incident_assignments;
INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary,occurred_at)
SELECT incident_id,'RESPONDER_STATUS',user_id,log_id::text,COALESCE(risk_level,'상태')||' / '||COALESCE(connection_status,'연결정보 없음'),recorded_at FROM responder_status_logs;
INSERT INTO incident_events(incident_id,event_type,source_ref,summary,occurred_at)
SELECT related_incident_id,'AI_JUDGMENT',judgment_id::text,COALESCE(summary,judgment_type),created_at FROM ai_judgment_logs WHERE related_incident_id IS NOT NULL;

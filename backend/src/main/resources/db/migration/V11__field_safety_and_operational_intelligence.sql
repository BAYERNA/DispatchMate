CREATE TABLE emergency_signals (
    signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),
    signal_type VARCHAR(20) NOT NULL CHECK (signal_type IN ('MAYDAY','EVACUATION_ASSIST')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ACKNOWLEDGED','RESOLVED','CANCELLED')),
    trigger_source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (trigger_source IN ('MANUAL','SENSOR','PAR_TIMEOUT')),
    location JSONB NOT NULL DEFAULT '{}'::jsonb,
    vitals JSONB NOT NULL DEFAULT '{}'::jsonb,
    audio_ref TEXT,
    last_communication_at TIMESTAMP,
    activated_at TIMESTAMP NOT NULL DEFAULT now(),
    acknowledged_by UUID REFERENCES users(user_id), acknowledged_at TIMESTAMP,
    resolved_by UUID REFERENCES users(user_id), resolved_at TIMESTAMP, resolution_note TEXT
);
CREATE INDEX idx_emergency_signals_active ON emergency_signals(incident_id,status,activated_at);

CREATE TABLE accountability_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    scope VARCHAR(20) NOT NULL DEFAULT 'ALL', team_label VARCHAR(80),
    status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','EXPIRED','CANCELLED')),
    deadline_at TIMESTAMP NOT NULL, created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT now(), completed_at TIMESTAMP
);
CREATE TABLE accountability_responses (
    session_id UUID NOT NULL REFERENCES accountability_sessions(session_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),
    response VARCHAR(20) NOT NULL CHECK (response IN ('SAFE','NEEDS_HELP')),
    location JSONB NOT NULL DEFAULT '{}'::jsonb, responded_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY(session_id,user_id)
);

CREATE TABLE durable_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(30) NOT NULL CHECK (job_type IN ('SMS','VOICE','PUSH','INTERAGENCY','ROUTING','BACKUP_VERIFY')),
    idempotency_key VARCHAR(220) NOT NULL UNIQUE, payload JSONB NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SUCCEEDED','FAILED','DEAD')),
    attempt_count INT NOT NULL DEFAULT 0, max_attempts INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT now(), locked_at TIMESTAMP, locked_by VARCHAR(100),
    last_error TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), completed_at TIMESTAMP
);
CREATE INDEX idx_durable_jobs_claim ON durable_jobs(status,next_attempt_at,created_at);

CREATE TABLE push_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    platform VARCHAR(15) NOT NULL CHECK (platform IN ('WEB','FCM','APNS')), endpoint_token TEXT NOT NULL,
    device_label VARCHAR(100), active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(user_id,platform,endpoint_token)
);

CREATE TABLE operational_routes (
    route_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    route_type VARCHAR(20) NOT NULL CHECK (route_type IN ('DISPATCH','ENTRY','EVACUATION','TRANSPORT')),
    title VARCHAR(120) NOT NULL, origin JSONB NOT NULL, destination JSONB NOT NULL,
    waypoints JSONB NOT NULL DEFAULT '[]'::jsonb, hazards JSONB NOT NULL DEFAULT '[]'::jsonb,
    distance_m INT, eta_seconds INT, status VARCHAR(15) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','BLOCKED','COMPLETED')),
    created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE indoor_position_updates (
    position_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id), floor_id UUID REFERENCES indoor_floors(floor_id) ON DELETE SET NULL,
    source VARCHAR(15) NOT NULL CHECK (source IN ('GPS','BLE','UWB','MANUAL')),
    x_percent NUMERIC(5,2) CHECK (x_percent BETWEEN 0 AND 100), y_percent NUMERIC(5,2) CHECK (y_percent BETWEEN 0 AND 100),
    latitude NUMERIC(10,7), longitude NUMERIC(10,7), accuracy_m NUMERIC(8,2), recorded_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_indoor_positions_latest ON indoor_position_updates(incident_id,user_id,recorded_at DESC);

CREATE TABLE resource_tags (
    tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), resource_id UUID NOT NULL REFERENCES operational_resources(resource_id) ON DELETE CASCADE,
    tag_type VARCHAR(10) NOT NULL CHECK (tag_type IN ('QR','RFID')), tag_value VARCHAR(180) NOT NULL UNIQUE,
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (lifecycle_status IN ('AVAILABLE','DEPLOYED','MAINTENANCE','LOST','RETIRED')),
    expires_at DATE, last_incident_id UUID REFERENCES incidents(incident_id), last_scanned_by UUID REFERENCES users(user_id), last_scanned_at TIMESTAMP
);

CREATE TABLE hospital_capacities (
    hospital_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL, external_ref VARCHAR(100) UNIQUE,
    latitude NUMERIC(10,7), longitude NUMERIC(10,7), emergency_status VARCHAR(15) NOT NULL DEFAULT 'UNKNOWN' CHECK (emergency_status IN ('AVAILABLE','LIMITED','FULL','DIVERT','UNKNOWN')),
    available_beds INT CHECK (available_beds>=0), specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
    source VARCHAR(30) NOT NULL DEFAULT 'MANUAL', updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE patient_handovers (
    handover_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    hospital_id UUID REFERENCES hospital_capacities(hospital_id), patient_ref VARCHAR(100) NOT NULL,
    triage_level VARCHAR(20), summary TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PREPARING' CHECK (status IN ('PREPARING','EN_ROUTE','ARRIVED','ACCEPTED','CANCELLED')),
    created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now(), accepted_at TIMESTAMP
);

CREATE TABLE incident_role_permissions (
    role_in_incident VARCHAR(30) NOT NULL, permission VARCHAR(50) NOT NULL,
    PRIMARY KEY(role_in_incident,permission)
);
INSERT INTO incident_role_permissions(role_in_incident,permission) VALUES
('COMMANDER','COMMAND'),('COMMANDER','PAR_MANAGE'),('COMMANDER','TACTICAL_BOARD'),('COMMANDER','ROUTE_MANAGE'),('COMMANDER','HANDOVER_VIEW'),
('COMMS','ALERT_CREATE'),('COMMS','PAR_RESPOND'),('ENTRY','PAR_RESPOND'),('ENTRY','POSITION_REPORT'),('ENTRY','MAYDAY'),
('SAFETY','PAR_MANAGE'),('SAFETY','TACTICAL_BOARD'),('SAFETY','MAYDAY_ACK'),('MEDICAL','HANDOVER_MANAGE'),('MEDICAL','PAR_RESPOND');

CREATE TABLE tactical_zones (
    zone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, zone_type VARCHAR(20) NOT NULL CHECK (zone_type IN ('HOT','WARM','COLD','STAGING','TRIAGE')),
    geometry JSONB NOT NULL DEFAULT '{}'::jsonb, status VARCHAR(15) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED')),
    created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE tactical_objectives (
    objective_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    zone_id UUID REFERENCES tactical_zones(zone_id) ON DELETE SET NULL, title VARCHAR(160) NOT NULL,
    owner_label VARCHAR(100), success_criteria TEXT, priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','BLOCKED','CANCELLED')),
    created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE after_action_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL UNIQUE REFERENCES incidents(incident_id) ON DELETE CASCADE,
    summary JSONB NOT NULL, recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_by UUID NOT NULL REFERENCES users(user_id), generated_at TIMESTAMP NOT NULL DEFAULT now(), approved_at TIMESTAMP
);
ALTER TABLE training_sessions ADD COLUMN source_incident_id UUID REFERENCES incidents(incident_id);

CREATE TABLE ai_drift_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model_name VARCHAR(80) NOT NULL,
    window_start TIMESTAMP NOT NULL, window_end TIMESTAMP NOT NULL, sample_count INT NOT NULL,
    false_positive_rate NUMERIC(8,4), false_negative_rate NUMERIC(8,4), unknown_rate NUMERIC(8,4),
    drift_status VARCHAR(15) NOT NULL CHECK (drift_status IN ('STABLE','WATCH','DRIFTED','INSUFFICIENT_DATA')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(model_name,window_start,window_end)
);

CREATE TABLE digital_twin_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    floor_id UUID REFERENCES indoor_floors(floor_id) ON DELETE SET NULL, scenario VARCHAR(30) NOT NULL CHECK (scenario IN ('SMOKE','HEAT','EVACUATION')),
    inputs JSONB NOT NULL, result JSONB NOT NULL, disclaimer TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE recovery_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(100) NOT NULL,
    schedule_cron VARCHAR(80) NOT NULL, retention_days INT NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
    rpo_minutes INT NOT NULL CHECK (rpo_minutes>0), rto_minutes INT NOT NULL CHECK (rto_minutes>0),
    enabled BOOLEAN NOT NULL DEFAULT true, created_by UUID NOT NULL REFERENCES users(user_id), updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE FUNCTION append_advanced_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_incident UUID; v_actor UUID; v_ref TEXT; v_type TEXT; v_summary TEXT;
BEGIN
  IF TG_TABLE_NAME='emergency_signals' THEN v_incident:=NEW.incident_id; v_actor:=NEW.user_id; v_ref:=NEW.signal_id::text; v_type:='MAYDAY_'||NEW.status; v_summary:=NEW.signal_type||' · '||NEW.status;
  ELSIF TG_TABLE_NAME='accountability_sessions' THEN v_incident:=NEW.incident_id; v_actor:=NEW.created_by; v_ref:=NEW.session_id::text; v_type:='PAR_'||NEW.status; v_summary:='인원점검 · '||NEW.status;
  ELSIF TG_TABLE_NAME='tactical_objectives' THEN v_incident:=NEW.incident_id; v_actor:=NEW.created_by; v_ref:=NEW.objective_id::text; v_type:='OBJECTIVE_'||NEW.status; v_summary:=NEW.title||' · '||NEW.status;
  ELSIF TG_TABLE_NAME='patient_handovers' THEN v_incident:=NEW.incident_id; v_actor:=NEW.created_by; v_ref:=NEW.handover_id::text; v_type:='PATIENT_HANDOVER_'||NEW.status; v_summary:=NEW.patient_ref||' · '||NEW.status;
  END IF;
  INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary) VALUES(v_incident,v_type,v_actor,v_ref,v_summary);
  RETURN NEW;
END; $$;
CREATE TRIGGER audit_mayday_insert AFTER INSERT ON emergency_signals FOR EACH ROW EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_mayday_update AFTER UPDATE OF status ON emergency_signals FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_par_insert AFTER INSERT ON accountability_sessions FOR EACH ROW EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_par_update AFTER UPDATE OF status ON accountability_sessions FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_objective_insert AFTER INSERT ON tactical_objectives FOR EACH ROW EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_objective_update AFTER UPDATE OF status ON tactical_objectives FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_handover_insert AFTER INSERT ON patient_handovers FOR EACH ROW EXECUTE FUNCTION append_advanced_event();
CREATE TRIGGER audit_handover_update AFTER UPDATE OF status ON patient_handovers FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_advanced_event();

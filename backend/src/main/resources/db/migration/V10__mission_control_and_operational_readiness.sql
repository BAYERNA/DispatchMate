ALTER TABLE alerts ADD COLUMN automation_key VARCHAR(180);
CREATE UNIQUE INDEX uq_alerts_automation_key ON alerts(automation_key) WHERE automation_key IS NOT NULL;

CREATE TABLE notification_channel_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), alert_id UUID NOT NULL REFERENCES alerts(alert_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id), channel VARCHAR(10) NOT NULL CHECK(channel IN ('SMS','VOICE')),
    status VARCHAR(15) NOT NULL CHECK(status IN ('SENT','FAILED','UNAVAILABLE')), attempt_count INT NOT NULL DEFAULT 1,
    last_error TEXT, last_attempt_at TIMESTAMP NOT NULL DEFAULT now(), next_retry_at TIMESTAMP,
    UNIQUE(alert_id,user_id,channel)
);
CREATE TABLE incident_commands (
    command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    command_type VARCHAR(25) NOT NULL CHECK(command_type IN ('ASSIGN_TASK','HANDOVER','EVACUATE','MUSTER')),
    assignee_id UUID REFERENCES users(user_id), issued_by UUID NOT NULL REFERENCES users(user_id), title VARCHAR(150) NOT NULL,
    details TEXT, status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','COMPLETED','CANCELLED')),
    due_at TIMESTAMP, issued_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_commands_active ON incident_commands(incident_id,status,issued_at);

CREATE TABLE sop_template_items (
    template_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_type VARCHAR(20) NOT NULL,
    position INT NOT NULL, label VARCHAR(200) NOT NULL, required BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(incident_type,position)
);
INSERT INTO sop_template_items(incident_type,position,label) VALUES
('FIRE',1,'현장 지휘권과 통신 채널 확인'),('FIRE',2,'진입조·대기조 지정'),('FIRE',3,'대원 인원 점검'),('FIRE',4,'위험구역과 대피 경로 공유'),
('RESCUE',1,'구조 대상과 위험요인 확인'),('RESCUE',2,'구조·의료 역할 배정'),('RESCUE',3,'이송 경로 확보'),
('EMERGENCY',1,'환자 상태와 인원 확인'),('EMERGENCY',2,'응급 처치·이송 병원 확인'),('EMERGENCY',3,'인계 완료 확인');
CREATE TABLE incident_sop_items (
    sop_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    position INT NOT NULL, label VARCHAR(200) NOT NULL, required BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(15) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','SKIPPED')),
    completed_by UUID REFERENCES users(user_id), completed_at TIMESTAMP, note TEXT, UNIQUE(incident_id,position)
);

CREATE TABLE operational_resources (
    resource_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), resource_type VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL, total_quantity INT NOT NULL CHECK(total_quantity>=0), available_quantity INT NOT NULL CHECK(available_quantity>=0),
    unit VARCHAR(20) NOT NULL DEFAULT '개', status VARCHAR(15) NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','LIMITED','UNAVAILABLE')),
    updated_at TIMESTAMP NOT NULL DEFAULT now(), CHECK(available_quantity<=total_quantity)
);
CREATE TABLE incident_resource_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    resource_id UUID REFERENCES operational_resources(resource_id), item_name VARCHAR(100) NOT NULL, quantity INT NOT NULL CHECK(quantity>0),
    requested_by UUID NOT NULL REFERENCES users(user_id), status VARCHAR(15) NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','FULFILLED','REJECTED')),
    requested_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE indoor_floors (
    floor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    floor_label VARCHAR(40) NOT NULL, width_m NUMERIC(8,2) NOT NULL CHECK(width_m>0), height_m NUMERIC(8,2) NOT NULL CHECK(height_m>0),
    UNIQUE(incident_id,floor_label)
);
CREATE TABLE operational_markers (
    marker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    floor_id UUID REFERENCES indoor_floors(floor_id) ON DELETE CASCADE, marker_type VARCHAR(20) NOT NULL CHECK(marker_type IN ('ENTRY','HAZARD','RESPONDER','VICTIM','RESOURCE','EXIT')),
    label VARCHAR(100) NOT NULL, x_percent NUMERIC(5,2) NOT NULL CHECK(x_percent BETWEEN 0 AND 100),
    y_percent NUMERIC(5,2) NOT NULL CHECK(y_percent BETWEEN 0 AND 100), created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE ai_model_versions (
    model_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model_name VARCHAR(80) NOT NULL, version VARCHAR(50) NOT NULL,
    status VARCHAR(15) NOT NULL CHECK(status IN ('CANDIDATE','ACTIVE','RETIRED')), deployed_at TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_by UUID NOT NULL REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(model_name,version)
);
CREATE UNIQUE INDEX uq_active_ai_model ON ai_model_versions(model_name) WHERE status='ACTIVE';
CREATE TABLE ai_threshold_history (
    threshold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model_name VARCHAR(80) NOT NULL,
    threshold_name VARCHAR(80) NOT NULL, old_value NUMERIC(8,4), new_value NUMERIC(8,4) NOT NULL,
    reason TEXT NOT NULL, changed_by UUID NOT NULL REFERENCES users(user_id), changed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE collaboration_packets (
    packet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
    agency_name VARCHAR(100) NOT NULL, classification VARCHAR(20) NOT NULL CHECK(classification IN ('PUBLIC','OPERATIONAL','RESTRICTED')),
    summary TEXT NOT NULL, status VARCHAR(15) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','SHARED','FAILED','REVOKED')),
    created_by UUID NOT NULL REFERENCES users(user_id), approved_by UUID REFERENCES users(user_id), created_at TIMESTAMP NOT NULL DEFAULT now(), shared_at TIMESTAMP
);
CREATE TABLE recovery_checkpoints (
    checkpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), artifact_ref TEXT NOT NULL, checksum_sha256 VARCHAR(64) NOT NULL,
    restore_verified BOOLEAN NOT NULL DEFAULT false, verified_by UUID REFERENCES users(user_id), created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT now(), verified_at TIMESTAMP
);

CREATE TABLE safety_alert_state (
    incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(user_id),
    rule_code VARCHAR(40) NOT NULL, last_source_at TIMESTAMP NOT NULL, last_alerted_at TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY(incident_id,user_id,rule_code)
);

CREATE FUNCTION append_mission_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_incident UUID; v_actor UUID; v_type TEXT; v_summary TEXT; v_ref TEXT;
BEGIN
    IF TG_TABLE_NAME='incident_commands' THEN v_incident:=NEW.incident_id; v_actor:=CASE WHEN TG_OP='INSERT' THEN NEW.issued_by ELSE NULL END; v_ref:=NEW.command_id::text; v_type:='COMMAND_'||TG_OP; v_summary:=NEW.title||' · '||NEW.status;
    ELSIF TG_TABLE_NAME='incident_sop_items' THEN v_incident:=NEW.incident_id; v_actor:=NEW.completed_by; v_ref:=NEW.sop_item_id::text; v_type:='SOP_CHANGED'; v_summary:=NEW.label||' · '||NEW.status;
    ELSIF TG_TABLE_NAME='incident_resource_requests' THEN v_incident:=NEW.incident_id; v_actor:=CASE WHEN TG_OP='INSERT' THEN NEW.requested_by ELSE NULL END; v_ref:=NEW.request_id::text; v_type:='RESOURCE_'||TG_OP; v_summary:=NEW.item_name||' x'||NEW.quantity||' · '||NEW.status;
    ELSIF TG_TABLE_NAME='operational_markers' THEN v_incident:=NEW.incident_id; v_actor:=NEW.created_by; v_ref:=NEW.marker_id::text; v_type:='MAP_MARKER_CREATED'; v_summary:=NEW.marker_type||' · '||NEW.label;
    ELSIF TG_TABLE_NAME='collaboration_packets' THEN v_incident:=NEW.incident_id; v_actor:=CASE WHEN TG_OP='INSERT' THEN NEW.created_by ELSE NEW.approved_by END; v_ref:=NEW.packet_id::text; v_type:='COLLABORATION_'||TG_OP; v_summary:=NEW.agency_name||' · '||NEW.status;
    END IF;
    INSERT INTO incident_events(incident_id,event_type,actor_user_id,source_ref,summary) VALUES(v_incident,v_type,v_actor,v_ref,v_summary);
    RETURN NEW;
END; $$;
CREATE TRIGGER audit_command_insert AFTER INSERT ON incident_commands FOR EACH ROW EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_command_update AFTER UPDATE OF status ON incident_commands FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_sop AFTER UPDATE OF status ON incident_sop_items FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_resource_insert AFTER INSERT ON incident_resource_requests FOR EACH ROW EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_resource_update AFTER UPDATE OF status ON incident_resource_requests FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_marker AFTER INSERT ON operational_markers FOR EACH ROW EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_collaboration_insert AFTER INSERT ON collaboration_packets FOR EACH ROW EXECUTE FUNCTION append_mission_event();
CREATE TRIGGER audit_collaboration_update AFTER UPDATE OF status ON collaboration_packets FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION append_mission_event();

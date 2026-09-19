-- DispatchMate V13: executable governance, SLOs, provider resilience and field-device assurance.

CREATE TABLE retention_execution_plans (
  execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES data_retention_policies(policy_id),
  cutoff_at timestamptz NOT NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  protected_count integer NOT NULL DEFAULT 0,
  sample_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','APPROVED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  approved_by uuid REFERENCES users(user_id),
  approved_at timestamptz,
  executed_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE provider_circuit_breakers (
  provider_key varchar(80) PRIMARY KEY,
  state varchar(20) NOT NULL DEFAULT 'CLOSED' CHECK(state IN ('CLOSED','OPEN','HALF_OPEN')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  success_count bigint NOT NULL DEFAULT 0,
  failure_count bigint NOT NULL DEFAULT 0,
  opened_at timestamptz,
  next_probe_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE slo_objectives (
  objective_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key varchar(100) UNIQUE NOT NULL,
  name varchar(200) NOT NULL,
  target_ratio numeric(7,6) NOT NULL CHECK(target_ratio > 0 AND target_ratio <= 1),
  window_minutes integer NOT NULL CHECK(window_minutes BETWEEN 5 AND 525600),
  threshold_ms integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE slo_measurements (
  measurement_id bigserial PRIMARY KEY,
  metric_key varchar(100) NOT NULL REFERENCES slo_objectives(metric_key),
  good_count integer NOT NULL CHECK(good_count >= 0),
  total_count integer NOT NULL CHECK(total_count >= good_count),
  latency_ms integer,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  measured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_slo_measurements_window ON slo_measurements(metric_key, measured_at DESC);

CREATE TABLE certificate_inventory (
  certificate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name varchar(120) UNIQUE NOT NULL,
  fingerprint_sha256 varchar(64) NOT NULL,
  subject_dn text NOT NULL,
  issuer_dn text NOT NULL,
  not_before timestamptz NOT NULL,
  not_after timestamptz NOT NULL,
  source varchar(30) NOT NULL CHECK(source IN ('VAULT','KMS','FILE','PLATFORM')),
  last_verified_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_export_manifests (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_sequence bigint NOT NULL,
  to_sequence bigint NOT NULL,
  event_count integer NOT NULL,
  head_hash varchar(64),
  artifact_uri text NOT NULL,
  artifact_hash varchar(64) NOT NULL,
  storage_class varchar(30) NOT NULL DEFAULT 'WORM',
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','FAILED')),
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_sequence,to_sequence)
);

CREATE TABLE ai_guardrail_policies (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name varchar(120) UNIQUE NOT NULL,
  max_false_positive_rate numeric(5,4) NOT NULL DEFAULT .25,
  max_false_negative_rate numeric(5,4) NOT NULL DEFAULT .20,
  minimum_samples integer NOT NULL DEFAULT 20,
  auto_rollback boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE privileged_action_approvals (
  approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type varchar(80) NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id varchar(160) NOT NULL,
  request_payload jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED','EXECUTED')),
  requested_by uuid NOT NULL REFERENCES users(user_id),
  approved_by uuid REFERENCES users(user_id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL,
  CHECK(approved_by IS NULL OR approved_by <> requested_by)
);
CREATE UNIQUE INDEX ux_pending_privileged_action ON privileged_action_approvals(action_type,resource_type,resource_id) WHERE status='PENDING';

CREATE TABLE temporary_access_grants (
  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id),
  incident_id uuid REFERENCES incidents(incident_id),
  permission varchar(100) NOT NULL,
  reason text NOT NULL,
  granted_by uuid NOT NULL REFERENCES users(user_id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_temporary_access_active ON temporary_access_grants(user_id,incident_id,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE managed_field_devices (
  device_registration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id),
  platform varchar(20) NOT NULL CHECK(platform IN ('ANDROID','IOS','WEB','WEARABLE')),
  device_fingerprint varchar(128) UNIQUE NOT NULL,
  attestation_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(attestation_status IN ('PENDING','VERIFIED','FAILED','REVOKED')),
  encryption_capability varchar(40),
  background_location_enabled boolean NOT NULL DEFAULT false,
  remote_wipe_requested_at timestamptz,
  remote_wipe_confirmed_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offline_asset_manifests (
  asset_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(user_id),
  incident_id uuid REFERENCES incidents(incident_id),
  media_type varchar(80) NOT NULL,
  byte_size bigint NOT NULL CHECK(byte_size > 0),
  content_hash varchar(64) NOT NULL,
  encryption varchar(40) NOT NULL DEFAULT 'AES-GCM',
  priority smallint NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 9),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','UPLOADING','VERIFIED','FAILED','DELETED')),
  storage_uri text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

INSERT INTO slo_objectives(metric_key,name,target_ratio,window_minutes,threshold_ms) VALUES
 ('alert_delivery','알림 30초 내 전달',.995,1440,30000),
 ('mayday_ack','MAYDAY 60초 내 확인',.999,1440,60000),
 ('api_availability','핵심 API 가용성',.999,43200,NULL)
ON CONFLICT(metric_key) DO NOTHING;

INSERT INTO ai_guardrail_policies(model_name) VALUES('fire-detection') ON CONFLICT(model_name) DO NOTHING;

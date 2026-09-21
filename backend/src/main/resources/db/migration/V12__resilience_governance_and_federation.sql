-- DispatchMate V12: resilience, privacy, evidence, AI governance and federation.
-- PostGIS is deliberately optional; GeoJSON remains the portable fallback.

CREATE TABLE cluster_leases (
  lease_key varchar(120) PRIMARY KEY,
  owner_id varchar(160) NOT NULL,
  fencing_token bigint NOT NULL DEFAULT 1,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE immutable_audit_events (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_no bigserial UNIQUE NOT NULL,
  actor_id uuid REFERENCES users(user_id),
  actor_role varchar(30),
  action varchar(120) NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id varchar(160),
  incident_id uuid REFERENCES incidents(incident_id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash varchar(64),
  event_hash varchar(64) NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_immutable_audit_incident ON immutable_audit_events(incident_id, sequence_no);

CREATE TABLE disaster_recovery_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES recovery_policies(policy_id),
  run_type varchar(30) NOT NULL CHECK (run_type IN ('BACKUP','RESTORE_DRILL','FAILOVER','FAILBACK','CHAOS')),
  status varchar(30) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','RUNNING','SUCCEEDED','FAILED','ABORTED')),
  target_environment varchar(80) NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_mutations (
  mutation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(user_id),
  incident_id uuid REFERENCES incidents(incident_id),
  entity_type varchar(80) NOT NULL,
  entity_id varchar(160) NOT NULL,
  operation varchar(20) NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
  base_version bigint NOT NULL DEFAULT 0,
  server_version bigint NOT NULL,
  client_timestamp timestamptz NOT NULL,
  payload jsonb NOT NULL,
  resolution varchar(30) NOT NULL CHECK (resolution IN ('APPLIED','MERGED','CONFLICT','REJECTED')),
  conflict_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, server_version)
);
CREATE INDEX idx_sync_mutations_entity ON sync_mutations(entity_type, entity_id, server_version DESC);

CREATE TABLE building_models (
  model_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name varchar(200) NOT NULL,
  model_format varchar(20) NOT NULL CHECK (model_format IN ('IFC','GLTF','GEOJSON','SVG')),
  version varchar(80) NOT NULL,
  source_uri text NOT NULL,
  content_hash varchar(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(facility_name, version)
);

CREATE TABLE radio_transcripts (
  transcript_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  channel_label varchar(80) NOT NULL,
  speaker_label varchar(120),
  transcript text NOT NULL,
  language varchar(12) NOT NULL DEFAULT 'ko',
  confidence numeric(5,4),
  audio_uri text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  review_status varchar(20) NOT NULL DEFAULT 'UNREVIEWED' CHECK (review_status IN ('UNREVIEWED','VERIFIED','CORRECTED','REJECTED')),
  reviewed_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_radio_transcripts_search ON radio_transcripts(incident_id, started_at DESC);

CREATE TABLE electronic_signatures (
  signature_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type varchar(80) NOT NULL,
  resource_id uuid NOT NULL,
  signer_id uuid NOT NULL REFERENCES users(user_id),
  signer_role varchar(40) NOT NULL,
  document_hash varchar(64) NOT NULL,
  signature_algorithm varchar(40) NOT NULL,
  signature_value text NOT NULL,
  public_key_id varchar(160) NOT NULL,
  verification_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VALID','INVALID','REVOKED')),
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(resource_type, resource_id, signer_id, document_hash)
);

CREATE TABLE data_retention_policies (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_category varchar(80) NOT NULL UNIQUE,
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 36500),
  action varchar(20) NOT NULL CHECK (action IN ('DELETE','ANONYMIZE','ARCHIVE')),
  legal_hold boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence_assets (
  evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  evidence_type varchar(30) NOT NULL CHECK (evidence_type IN ('VIDEO','IMAGE','AUDIO','DOCUMENT','SENSOR')),
  source_uri text NOT NULL,
  content_hash varchar(64) NOT NULL,
  previous_custody_hash varchar(64),
  custody_hash varchar(64) NOT NULL UNIQUE,
  encryption_key_ref varchar(200),
  retention_until timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  collected_by uuid REFERENCES users(user_id),
  collected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_model_releases (
  release_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name varchar(120) NOT NULL,
  version varchar(80) NOT NULL,
  artifact_uri text NOT NULL,
  artifact_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','APPROVED','ACTIVE','ROLLED_BACK','REJECTED')),
  explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_required boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES users(user_id),
  approved_at timestamptz,
  activated_at timestamptz,
  rollback_of uuid REFERENCES ai_model_releases(release_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_name, version)
);
CREATE UNIQUE INDEX ux_ai_one_active_model ON ai_model_releases(model_name) WHERE status='ACTIVE';

CREATE TABLE federation_agencies (
  agency_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_code varchar(50) UNIQUE NOT NULL,
  name varchar(200) NOT NULL,
  endpoint_uri text,
  trust_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (trust_status IN ('PENDING','TRUSTED','SUSPENDED','REVOKED')),
  certificate_fingerprint varchar(128),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE federation_shares (
  share_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  agency_id uuid NOT NULL REFERENCES federation_agencies(agency_id),
  scope jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource_demand_forecasts (
  forecast_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  horizon_minutes integer NOT NULL CHECK (horizon_minutes BETWEEN 5 AND 1440),
  demand jsonb NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence varchar(20) NOT NULL CHECK (confidence IN ('LOW','MEDIUM','HIGH')),
  disclaimer text NOT NULL,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public_status_tokens (
  token_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  token_hash varchar(64) UNIQUE NOT NULL,
  audience varchar(30) NOT NULL CHECK (audience IN ('PUBLIC','FACILITY_MANAGER','FAMILY_LIAISON')),
  allowed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_interface_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(user_id),
  locale varchar(12) NOT NULL DEFAULT 'ko-KR',
  high_contrast boolean NOT NULL DEFAULT false,
  reduced_motion boolean NOT NULL DEFAULT false,
  text_scale numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (text_scale BETWEEN 0.8 AND 2.0),
  role_layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO data_retention_policies(data_category,retention_days,action)
VALUES ('radio_transcript', 365, 'ANONYMIZE'), ('location_history', 90, 'DELETE'),
       ('evidence', 2555, 'ARCHIVE'), ('audit_log', 3650, 'ARCHIVE')
ON CONFLICT (data_category) DO NOTHING;

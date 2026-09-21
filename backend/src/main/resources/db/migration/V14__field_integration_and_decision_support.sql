-- DispatchMate V14: verified integrations, field intelligence and decision support.

CREATE TABLE provider_webhook_receipts (
  receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key varchar(80) NOT NULL,
  external_event_id varchar(200) NOT NULL,
  event_type varchar(100) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  signature_valid boolean NOT NULL,
  processing_status varchar(20) NOT NULL DEFAULT 'RECEIVED' CHECK(processing_status IN ('RECEIVED','PROCESSED','REJECTED','DUPLICATE')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider_key,external_event_id)
);

CREATE TABLE offline_upload_chunks (
  chunk_id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES offline_asset_manifests(asset_id),
  chunk_index integer NOT NULL CHECK(chunk_index>=0),
  byte_size integer NOT NULL CHECK(byte_size>0),
  content_hash varchar(64) NOT NULL,
  storage_uri text,
  status varchar(20) NOT NULL DEFAULT 'REGISTERED' CHECK(status IN ('REGISTERED','UPLOADED','VERIFIED','REJECTED')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id,chunk_index)
);

CREATE TABLE building_model_elements (
  element_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES building_models(model_id),
  external_id varchar(160) NOT NULL,
  floor_label varchar(80),
  element_type varchar(30) NOT NULL CHECK(element_type IN ('ROOM','STAIR','EXIT','FIRE_DOOR','HYDRANT','HAZARD','ASSEMBLY_POINT')),
  label varchar(200) NOT NULL,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  accessible boolean NOT NULL DEFAULT true,
  UNIQUE(model_id,external_id)
);

CREATE TABLE radio_keyword_detections (
  detection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES radio_transcripts(transcript_id),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  keyword varchar(80) NOT NULL,
  severity varchar(20) NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')),
  confidence numeric(5,4) NOT NULL,
  context_excerpt text NOT NULL,
  acknowledged_by uuid REFERENCES users(user_id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE handover_signature_requirements (
  handover_id uuid PRIMARY KEY REFERENCES patient_handovers(handover_id),
  sender_signature_id uuid REFERENCES electronic_signatures(signature_id),
  receiver_signature_id uuid REFERENCES electronic_signatures(signature_id),
  receiving_organization varchar(200),
  received_at timestamptz,
  verification_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(verification_status IN ('PENDING','PARTIAL','VERIFIED','INVALID')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trusted_signing_keys (
  key_id varchar(160) PRIMARY KEY,
  owner_label varchar(200) NOT NULL,
  algorithm varchar(40) NOT NULL CHECK(algorithm IN ('RSA-SHA256','ECDSA-SHA256')),
  public_key_pem text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','EXPIRED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public_data_observations (
  observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(incident_id),
  data_type varchar(40) NOT NULL CHECK(data_type IN ('WEATHER','ROAD_CLOSURE','SHELTER','WATER_SUPPLY','HAZMAT','HOSPITAL')),
  source_name varchar(160) NOT NULL,
  external_ref varchar(200),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz,
  confidence varchar(20) NOT NULL DEFAULT 'UNKNOWN' CHECK(confidence IN ('LOW','MEDIUM','HIGH','OFFICIAL','UNKNOWN')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_name,external_ref,observed_at)
);

CREATE TABLE drone_flight_plans (
  flight_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  device_id uuid REFERENCES devices(device_id),
  mission_type varchar(30) NOT NULL CHECK(mission_type IN ('RECON','THERMAL_SEARCH','PERSON_SEARCH','HAZMAT','MAPPING')),
  route jsonb NOT NULL,
  max_altitude_m numeric(8,2) NOT NULL CHECK(max_altitude_m>0 AND max_altitude_m<=150),
  return_point jsonb NOT NULL,
  battery_minimum_percent integer NOT NULL DEFAULT 30 CHECK(battery_minimum_percent BETWEEN 10 AND 100),
  approval_status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(approval_status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  flight_status varchar(20) NOT NULL DEFAULT 'PLANNED' CHECK(flight_status IN ('PLANNED','ACTIVE','RETURNING','COMPLETED','ABORTED')),
  created_by uuid NOT NULL REFERENCES users(user_id),
  approved_by uuid REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE security_anomaly_events (
  anomaly_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(user_id),
  incident_id uuid REFERENCES incidents(incident_id),
  anomaly_type varchar(50) NOT NULL CHECK(anomaly_type IN ('LOGIN_FAILURE_BURST','MASS_READ','LOCATION_ACCESS','DEVICE_CHANGE','PRIVILEGE_ESCALATION','SIGNATURE_FAILURE')),
  risk_score integer NOT NULL CHECK(risk_score BETWEEN 0 AND 100),
  evidence jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED','FALSE_POSITIVE')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(user_id),
  resolved_at timestamptz
);
CREATE INDEX idx_security_anomaly_open ON security_anomaly_events(status,risk_score DESC,detected_at DESC);

CREATE TABLE decision_recommendations (
  recommendation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(incident_id),
  recommendation_type varchar(50) NOT NULL,
  title varchar(200) NOT NULL,
  rationale jsonb NOT NULL,
  source_freshness jsonb NOT NULL,
  priority integer NOT NULL CHECK(priority BETWEEN 1 AND 5),
  status varchar(20) NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','ACCEPTED','REJECTED','EXPIRED','COMPLETED')),
  decided_by uuid REFERENCES users(user_id),
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE facility_profiles (
  facility_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  address text,
  manager_contact_encrypted text,
  hazard_inventory jsonb NOT NULL DEFAULT '[]'::jsonb,
  emergency_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  building_model_id uuid REFERENCES building_models(model_id),
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operational_kpi_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES incidents(incident_id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  metrics jsonb NOT NULL,
  privacy_scope varchar(30) NOT NULL DEFAULT 'AGGREGATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(incident_id,period_start,period_end)
);

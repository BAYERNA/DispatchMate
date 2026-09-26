-- DispatchMate V26: incident communication heartbeat and degraded/offline monitoring.

CREATE TABLE incident_communication_heartbeats (
  incident_id uuid NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  client_id varchar(120) NOT NULL,
  reported_state varchar(20) NOT NULL CHECK(reported_state IN ('CONNECTED','DEGRADED','OFFLINE','RECOVERING')),
  transport varchar(20) NOT NULL DEFAULT 'UNKNOWN' CHECK(transport IN ('WIFI','CELLULAR','MESH','SMS','UNKNOWN')),
  rssi_dbm smallint CHECK(rssi_dbm BETWEEN -140 AND 0),
  downlink_mbps numeric(8,2) CHECK(downlink_mbps>=0),
  rtt_ms integer CHECK(rtt_ms BETWEEN 0 AND 60000),
  socket_connected boolean NOT NULL DEFAULT false,
  client_online boolean NOT NULL DEFAULT true,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_transition_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(incident_id,user_id,client_id)
);

CREATE INDEX idx_communication_heartbeat_incident
  ON incident_communication_heartbeats(incident_id,last_heartbeat_at DESC);
CREATE INDEX idx_communication_heartbeat_stale
  ON incident_communication_heartbeats(last_heartbeat_at)
  WHERE reported_state<>'OFFLINE';

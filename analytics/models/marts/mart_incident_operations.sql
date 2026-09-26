select
    i.incident_id,
    i.incident_number,
    i.incident_type,
    i.status,
    i.source,
    i.reported_at,
    i.closed_at,
    extract(epoch from (i.closed_at - i.reported_at))::bigint as resolution_seconds,
    extract(epoch from (a.first_alert_at - i.reported_at))::bigint as first_alert_seconds,
    extract(epoch from (a.first_acknowledged_at - a.first_alert_at))::bigint as first_ack_seconds,
    a.assigned_responder_count,
    a.alert_count,
    a.escalated_alert_count,
    a.acknowledgement_count,
    a.status_sample_count,
    a.danger_sample_count,
    a.disconnected_sample_count,
    a.ai_judgment_count,
    a.average_ai_confidence
from {{ ref('stg_incidents') }} i
join {{ ref('int_incident_activity') }} a using (incident_id)

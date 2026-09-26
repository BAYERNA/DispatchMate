select
    reported_at::date as metric_date,
    incident_type,
    count(*) as incident_count,
    count(*) filter (where status = 'CLOSED') as closed_incident_count,
    avg(resolution_seconds) filter (where resolution_seconds >= 0) as average_resolution_seconds,
    avg(first_alert_seconds) filter (where first_alert_seconds >= 0) as average_first_alert_seconds,
    avg(first_ack_seconds) filter (where first_ack_seconds >= 0) as average_first_ack_seconds,
    sum(alert_count) as alert_count,
    sum(escalated_alert_count) as escalated_alert_count,
    sum(danger_sample_count) as danger_sample_count,
    sum(disconnected_sample_count) as disconnected_sample_count,
    sum(ai_judgment_count) as ai_judgment_count,
    avg(average_ai_confidence) as average_ai_confidence
from {{ ref('mart_incident_operations') }}
group by reported_at::date, incident_type

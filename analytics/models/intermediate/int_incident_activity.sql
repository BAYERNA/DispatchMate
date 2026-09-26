with assignments as (
    select incident_id, count(*) as assigned_responder_count
    from {{ source('operational', 'incident_assignments') }}
    group by incident_id
),
alerts as (
    select
        incident_id,
        count(*) as alert_count,
        min(sent_at) as first_alert_at,
        count(*) filter (where escalated_at is not null) as escalated_alert_count
    from {{ ref('stg_alerts') }}
    group by incident_id
),
acknowledgements as (
    select
        a.incident_id,
        count(distinct k.ack_id) as acknowledgement_count,
        min(k.acknowledged_at) as first_acknowledged_at
    from {{ source('operational', 'alert_acknowledgements') }} k
    join {{ ref('stg_alerts') }} a on a.alert_id = k.alert_id
    group by a.incident_id
),
status_logs as (
    select
        incident_id,
        count(*) as status_sample_count,
        count(*) filter (where risk_level = 'DANGER') as danger_sample_count,
        count(*) filter (where connection_status = 'DISCONNECTED') as disconnected_sample_count
    from {{ source('operational', 'responder_status_logs') }}
    group by incident_id
),
ai as (
    select
        related_incident_id as incident_id,
        count(*) as ai_judgment_count,
        avg(confidence_score) as average_ai_confidence
    from {{ source('operational', 'ai_judgment_logs') }}
    where related_incident_id is not null
    group by related_incident_id
)
select
    i.incident_id,
    coalesce(x.assigned_responder_count, 0) as assigned_responder_count,
    coalesce(a.alert_count, 0) as alert_count,
    a.first_alert_at,
    coalesce(a.escalated_alert_count, 0) as escalated_alert_count,
    coalesce(k.acknowledgement_count, 0) as acknowledgement_count,
    k.first_acknowledged_at,
    coalesce(s.status_sample_count, 0) as status_sample_count,
    coalesce(s.danger_sample_count, 0) as danger_sample_count,
    coalesce(s.disconnected_sample_count, 0) as disconnected_sample_count,
    coalesce(j.ai_judgment_count, 0) as ai_judgment_count,
    j.average_ai_confidence
from {{ ref('stg_incidents') }} i
left join assignments x using (incident_id)
left join alerts a using (incident_id)
left join acknowledgements k using (incident_id)
left join status_logs s using (incident_id)
left join ai j using (incident_id)

select
    alert_id,
    incident_id,
    alert_type,
    source_type,
    channel,
    sent_at,
    escalated_at
from {{ source('operational', 'alerts') }}

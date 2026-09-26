select
    incident_id,
    incident_number,
    incident_type,
    status,
    source,
    latitude,
    longitude,
    reported_at,
    closed_at,
    created_at
from {{ source('operational', 'incidents') }}

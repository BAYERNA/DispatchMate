select incident_id
from {{ ref('stg_incidents') }}
where closed_at is not null and closed_at < reported_at

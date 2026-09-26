select incident_id
from {{ ref('stg_incidents') }}
where (latitude is null) <> (longitude is null)
   or latitude not between -90 and 90
   or longitude not between -180 and 180

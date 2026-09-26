select k.ack_id
from {{ source('operational', 'alert_acknowledgements') }} k
join {{ source('operational', 'alerts') }} a on a.alert_id = k.alert_id
where k.acknowledged_at < a.sent_at

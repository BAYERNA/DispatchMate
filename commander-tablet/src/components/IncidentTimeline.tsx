import { useQuery } from '@tanstack/react-query'
import { getTimeline } from '../api/operations'
const LABEL:Record<string,string>={INCIDENT_CREATED:'출동 생성',RESPONDER_ASSIGNED:'대원 배정',RESPONDER_STATUS:'대원 상태',ALERT_CREATED:'알림 발송',ALERT_ACKNOWLEDGED:'알림 확인',AI_JUDGMENT:'AI 판단'}
export function IncidentTimeline({incidentId}:{incidentId:string}) {
  const query=useQuery({queryKey:['timeline',incidentId],queryFn:()=>getTimeline(incidentId),refetchInterval:10000})
  return <div className="wf" style={{marginTop:14}}><div className="wf-header"><span>사건 타임라인 · 감사 이력</span></div><div className="wf-body">
    {query.isError&&<div className="banner error">타임라인을 갱신하지 못했습니다.</div>}
    {!query.isLoading&&!query.data?.length&&<div className="spinner-text">기록된 이벤트가 없습니다.</div>}
    {query.data?.map(event=><div className="timeline-item" key={event.eventId}>
      <strong>{LABEL[event.eventType]??event.eventType}</strong> · {event.summary}
      <div className="alert-meta">{new Date(event.occurredAt).toLocaleString('ko-KR')} · {event.actorName??'시스템'}</div>
    </div>)}
  </div></div>
}

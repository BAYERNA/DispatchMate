import { useQuery } from '@tanstack/react-query'
import { getOperationsMap } from '../api/operations'
function point(value:number,min:number,max:number){return max===min?50:8+84*(value-min)/(max-min)}
export function OperationsMap({incidentId}:{incidentId:string}) {
  const query=useQuery({queryKey:['operations-map',incidentId],queryFn:()=>getOperationsMap(incidentId),refetchInterval:15000})
  if(query.isError)return <div className="banner error">작전 위치를 불러오지 못했습니다.</div>
  if(!query.data)return <div className="spinner-text">위치 확인 중…</div>
  const {incident,devices}=query.data
  const all=[...(incident.latitude!=null&&incident.longitude!=null?[{latitude:incident.latitude,longitude:incident.longitude}]:[]),...devices]
  if(!all.length)return <div className="spinner-text">등록된 좌표가 없습니다.</div>
  const lats=all.map(p=>Number(p.latitude)),lngs=all.map(p=>Number(p.longitude)); const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs)
  return <div><svg className="operations-map" viewBox="0 0 100 100" role="img" aria-label="현장 및 장비 상대 위치 지도">
    <rect x="1" y="1" width="98" height="98" rx="3" />
    {incident.latitude!=null&&incident.longitude!=null&&<g transform={`translate(${point(Number(incident.longitude),minLng,maxLng)} ${100-point(Number(incident.latitude),minLat,maxLat)})`}><circle r="4" className="incident-dot"/><text y="-6">현장</text></g>}
    {devices.map(device=><g key={device.deviceId} transform={`translate(${point(Number(device.longitude),minLng,maxLng)} ${100-point(Number(device.latitude),minLat,maxLat)})`}><circle r="3"/><text y="-5">{device.userName??device.serialNo}</text></g>)}
  </svg><div className="alert-meta">등록 좌표를 상대 배치한 작전도입니다. 배경 지도와 이동 경로는 포함하지 않습니다.</div>
  <ul>{devices.map(d=><li key={d.deviceId}>{d.userName??d.serialNo} · {d.deviceType} · {d.status} · {Number(d.latitude).toFixed(5)}, {Number(d.longitude).toFixed(5)} {d.batteryLevel!=null&&`· 배터리 ${d.batteryLevel}%`}</li>)}</ul></div>
}

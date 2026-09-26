import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { useEffect,useRef,useState } from 'react'
import { getFieldMission,requestFieldResource,updateCommandReceipt,updateSop } from '../api/mission'

const receiptLabel:Record<string,string>={PENDING:'전송 중',RECEIVED:'수신됨',READ:'열람함',ACCEPTED:'수락함',REJECTED:'거절함',COMPLETED:'완료'}

export function FieldMissionPanel({incidentId,userId}:{incidentId:string;userId:string}){
  const client=useQueryClient()
  const query=useQuery({queryKey:['field-mission',incidentId],queryFn:()=>getFieldMission(incidentId),refetchInterval:5000})
  const refresh=()=>client.invalidateQueries({queryKey:['field-mission',incidentId]})
  const receipt=useMutation({mutationFn:({id,status}:{id:string;status:string})=>updateCommandReceipt(id,status),onSuccess:refresh})
  const sop=useMutation({mutationFn:({id,status}:{id:string;status:string})=>updateSop(id,status),onSuccess:refresh})
  const reported=useRef(new Set<string>())
  const [item,setItem]=useState('')
  const request=useMutation({mutationFn:()=>requestFieldResource(incidentId,item,1),onSuccess:()=>{setItem('');refresh()}})
  const d=query.data

  useEffect(()=>{
    if(!d)return
    for(const current of d.commandReceipts.filter(value=>value.status==='PENDING')){
      if(reported.current.has(current.commandId))continue
      reported.current.add(current.commandId)
      void updateCommandReceipt(current.commandId,'RECEIVED').then(()=>client.invalidateQueries({queryKey:['field-mission',incidentId]})).catch(()=>reported.current.delete(current.commandId))
    }
  },[client,d,incidentId])

  if(!d)return null
  const commands=d.commands.filter(command=>d.commandReceipts.some(value=>value.commandId===command.commandId&&value.userId===userId))
  return <div className="wf" style={{marginBottom:14}}><div className="wf-header"><span>임무·SOP·작전도</span></div><div className="wf-body">
    <h3>내 지휘 명령</h3>
    {!commands.length&&<div className="spinner-text">현재 명령이 없습니다.</div>}
    {commands.map(command=>{const current=d.commandReceipts.find(value=>value.commandId===command.commandId);return <div className="alert-item" key={command.commandId}>
      <strong>{command.commandType}</strong> {command.title} · {receiptLabel[current?.status]??current?.status}
      {command.acknowledgementDueAt&&<div className="alert-meta">확인 기한 {new Date(command.acknowledgementDueAt).toLocaleTimeString('ko-KR')}</div>}
      <div>{current?.status==='RECEIVED'&&<button className="wf-btn small" onClick={()=>receipt.mutate({id:command.commandId,status:'READ'})}>명령 열람</button>}
      {current?.status==='READ'&&<><button className="wf-btn small primary" onClick={()=>receipt.mutate({id:command.commandId,status:'ACCEPTED'})}>수락</button><button className="wf-btn small" onClick={()=>receipt.mutate({id:command.commandId,status:'REJECTED'})}>거절</button></>}
      {current?.status==='ACCEPTED'&&<button className="wf-btn small primary" onClick={()=>receipt.mutate({id:command.commandId,status:'COMPLETED'})}>임무 완료</button>}</div>
    </div>})}
    <h3>현장 SOP</h3>{d.sop.map(value=><label className="assignment-row" key={value.sopItemId}><span>{value.required?'필수 · ':''}{value.label}</span><input type="checkbox" checked={value.status==='COMPLETED'} onChange={event=>sop.mutate({id:value.sopItemId,status:event.target.checked?'COMPLETED':'PENDING'})}/></label>)}
    <h3>지원 요청</h3><div className="form-row"><input className="wf-field" value={item} onChange={event=>setItem(event.target.value)} placeholder="필요 장비·인력"/><button className="wf-btn" onClick={()=>item.trim()&&request.mutate()}>요청</button></div>
    <h3>층별 위험 표식</h3>{d.markers.map(marker=><div className="alert-meta" key={marker.markerId}>{marker.markerType} · {marker.label} · ({marker.xPercent}%, {marker.yPercent}%)</div>)}
  </div></div>
}

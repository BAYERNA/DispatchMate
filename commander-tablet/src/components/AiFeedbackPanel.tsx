import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { saveAiFeedback } from '../api/operations'
import type { AiJudgmentSummaryResponse } from '../types'
export function AiFeedbackPanel({judgments}:{judgments:AiJudgmentSummaryResponse[]}) {
 const [saved,setSaved]=useState<string|null>(null)
 const mutation=useMutation({mutationFn:({id,verdict}:{id:string;verdict:string})=>saveAiFeedback(id,verdict),onSuccess:(_d,v)=>setSaved(v.id)})
 return <div className="wf" style={{marginTop:14}}><div className="wf-header"><span>AI 판단 피드백</span></div><div className="wf-body">
  {!judgments.length&&<div className="spinner-text">평가할 AI 판단이 없습니다.</div>}
  {judgments.map(j=><div className="alert-item" key={j.judgmentId}><div><strong>{j.judgmentType}</strong> {j.summary??'요약 없음'}</div><div className="form-row">
    {[['CORRECT','정확'],['FALSE_POSITIVE','오탐'],['FALSE_NEGATIVE','미탐'],['UNSURE','판단보류']].map(([value,label])=><button type="button" className="wf-btn small" disabled={mutation.isPending} onClick={()=>mutation.mutate({id:j.judgmentId,verdict:value})} key={value}>{label}</button>)}
    {saved===j.judgmentId&&<span className="tag role-commander">저장됨</span>}
  </div></div>)}
 </div></div>
}

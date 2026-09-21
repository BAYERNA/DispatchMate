import { useState } from 'react'
import { enablePush } from '../push/registerPush'
export function PushEnableButton(){const[state,setState]=useState('');return <div className="banner"><button className="wf-btn small" onClick={()=>enablePush().then(()=>setState('푸시 알림 활성화 완료')).catch(e=>setState(e instanceof Error?e.message:'활성화 실패'))}>종료 상태 푸시 활성화</button>{state&&<span> · {state}</span>}</div>}

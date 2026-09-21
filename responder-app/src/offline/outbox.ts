import { getStoredToken } from '../api/client'
const KEY='faind.offlineOutbox.v1'
export interface OutboxItem {id:string;userId:string;path:string;method:'POST'|'PATCH';body:unknown;createdAt:string;attempts:number}
function currentUserId(){try{return JSON.parse(localStorage.getItem('faind.user')??'{}').userId??''}catch{return ''}}
export function listOutbox():OutboxItem[]{try{return JSON.parse(localStorage.getItem(KEY)??'[]')}catch{return []}}
function save(items:OutboxItem[]){localStorage.setItem(KEY,JSON.stringify(items));window.dispatchEvent(new Event('faind:outbox'))}
export function enqueue(path:string,method:'POST'|'PATCH',body:unknown){const item={id:crypto.randomUUID(),userId:currentUserId(),path,method,body,createdAt:new Date().toISOString(),attempts:0};save([...listOutbox(),item]);return item}
export function isRetryable(error:unknown){return error instanceof TypeError||(error instanceof DOMException&&['TimeoutError','AbortError'].includes(error.name))||(typeof error==='object'&&error!==null&&'status'in error&&Number((error as {status:number}).status)>=500)}
export async function flushOutbox(){const token=getStoredToken(),userId=currentUserId();if(!token||!userId)return {sent:0,pending:0};let items=listOutbox(),sent=0
 for(const item of items.filter(i=>i.userId===userId)){try{const response=await fetch(item.path,{method:item.method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(item.body),signal:AbortSignal.timeout(15000)});if(response.ok){items=items.filter(i=>i.id!==item.id);save(items);sent++;continue}item.attempts++;save(items);break}catch{item.attempts++;save(items);break}}
 return {sent,pending:items.filter(i=>i.userId===userId).length}}

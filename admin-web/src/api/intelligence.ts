import { notifyRequest } from './client'
export const getMetrics=()=>notifyRequest<any>('/operations/metrics')
export const captureDrift=()=>notifyRequest<any>('/ai-drift-snapshots',{method:'POST'})
export const addHospital=(body:unknown)=>notifyRequest('/hospitals',{method:'POST',body})
export const addTag=(body:unknown)=>notifyRequest('/resource-tags',{method:'POST',body})
export const addRecoveryPolicy=(body:unknown)=>notifyRequest('/recovery-policies',{method:'POST',body})

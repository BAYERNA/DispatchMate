import { notifyRequest } from './client'
export interface AdvancedFieldData { signals:any[];par:any[];routes:any[];positions:any[];zones:any[];objectives:any[];hospitals:any[] }
export const getAdvancedField=(id:string)=>notifyRequest<AdvancedFieldData>(`/incidents/${id}/advanced-operations`)
export const sendMayday=(id:string,body:unknown)=>notifyRequest(`/incidents/${id}/mayday`,{method:'POST',body})
export const respondPar=(id:string,response:string)=>notifyRequest(`/par/${id}/respond`,{method:'POST',body:{response}})
export const reportPosition=(id:string,body:unknown)=>notifyRequest(`/incidents/${id}/positions`,{method:'POST',body})
export const scanResourceTag=(tag:string,incidentId:string)=>notifyRequest(`/resource-tags/${encodeURIComponent(tag)}/scan`,{method:'POST',body:{incidentId,status:'DEPLOYED'}})

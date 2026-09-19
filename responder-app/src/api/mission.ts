import { notifyRequest } from './client'
export interface FieldMission {commands:any[];sop:any[];resources:any[];inventory:any[];floors:any[];markers:any[]}
export const getFieldMission=(id:string)=>notifyRequest<FieldMission>(`/incidents/${id}/mission-control`)
export const updateCommand=(id:string,status:string)=>notifyRequest(`/commands/${id}/status`,{method:'PATCH',body:{status}})
export const updateSop=(id:string,status:string)=>notifyRequest(`/sop-items/${id}/status`,{method:'PATCH',body:{status}})
export const requestFieldResource=(incidentId:string,itemName:string,quantity:number)=>notifyRequest(`/incidents/${incidentId}/resource-requests`,{method:'POST',body:{itemName,quantity}})

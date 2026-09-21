import { notifyRequest } from './client'
export interface MissionControl {commands:any[];sop:any[];resources:any[];inventory:any[];floors:any[];markers:any[];packets:any[];channelAttempts:any[]}
export const getMission=(id:string)=>notifyRequest<MissionControl>(`/incidents/${id}/mission-control`)
export const createCommand=(id:string,body:unknown)=>notifyRequest(`/incidents/${id}/commands`,{method:'POST',body})
export const commandStatus=(id:string,status:string)=>notifyRequest(`/commands/${id}/status`,{method:'PATCH',body:{status}})
export const sopStatus=(id:string,status:string)=>notifyRequest(`/sop-items/${id}/status`,{method:'PATCH',body:{status}})
export const requestResource=(id:string,itemName:string,quantity:number,resourceId?:string)=>notifyRequest(`/incidents/${id}/resource-requests`,{method:'POST',body:{itemName,quantity,resourceId}})
export const resourceStatus=(id:string,status:string)=>notifyRequest(`/resource-requests/${id}/status`,{method:'PATCH',body:{status}})
export const createFloor=(id:string,body:unknown)=>notifyRequest(`/incidents/${id}/floors`,{method:'POST',body})
export const createMarker=(id:string,body:unknown)=>notifyRequest(`/incidents/${id}/markers`,{method:'POST',body})
export const createPacket=(id:string,body:unknown)=>notifyRequest(`/incidents/${id}/collaboration-packets`,{method:'POST',body})
export const sharePacket=(id:string)=>notifyRequest(`/collaboration-packets/${id}/share`,{method:'POST'})

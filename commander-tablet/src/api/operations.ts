import { notifyRequest } from './client'

export interface TimelineEvent { eventId:string; eventType:string; actorUserId:string|null; actorName:string|null; sourceRef:string|null; summary:string; occurredAt:string }
export interface MapDevice { deviceId:string; serialNo:string; deviceType:string; userId:string|null; userName:string|null; latitude:number; longitude:number; status:string; batteryLevel:number|null }
export interface OperationsMap { incident:{incidentId:string;address:string|null;latitude:number|null;longitude:number|null}; devices:MapDevice[] }
export interface TrainingSession { trainingId:string;title:string;scenario:string;status:'READY'|'RUNNING'|'COMPLETED'|'CANCELLED';createdByName:string;createdAt:string;events:{eventId:string;eventType:string;note:string;occurredAt:string}[] }
export const getTimeline=(id:string)=>notifyRequest<TimelineEvent[]>(`/incidents/${id}/timeline`)
export const getOperationsMap=(id:string)=>notifyRequest<OperationsMap>(`/incidents/${id}/operations-map`)
export const listTraining=()=>notifyRequest<TrainingSession[]>('/training-sessions')
export const createTraining=(title:string,scenario:string)=>notifyRequest<TrainingSession>('/training-sessions',{method:'POST',body:{title,scenario}})
export const trainingAction=(id:string,action:string,note?:string)=>notifyRequest(`/training-sessions/${id}/${action}`,{method:'PATCH',body:{note}})
export const saveAiFeedback=(id:string,verdict:string,note?:string)=>notifyRequest(`/ai-judgments/${id}/feedback`,{method:'POST',body:{verdict,note}})

import { notifyRequest } from './client'
export interface Readiness {unreceived:number;unacknowledged:number;failedChannels:number;openCommands:number;pendingRequiredSop:number;notificationUptimeSeconds:number;latestRecoveryCheckpoint:{checkpointId:string;createdAt:string;restoreVerified:boolean;verifiedAt:string|null}|null}
export const getReadiness=()=>notifyRequest<Readiness>('/operations/readiness')
export const getModels=()=>notifyRequest<any[]>('/ai-models')
export const addModel=(body:unknown)=>notifyRequest('/ai-models',{method:'POST',body})
export const changeThreshold=(body:unknown)=>notifyRequest('/ai-thresholds',{method:'POST',body})
export const addCheckpoint=(artifactRef:string,checksumSha256:string)=>notifyRequest('/recovery-checkpoints',{method:'POST',body:{artifactRef,checksumSha256}})
export const verifyCheckpoint=(id:string)=>notifyRequest(`/recovery-checkpoints/${id}/verify`,{method:'PATCH'})
export const getInventory=()=>notifyRequest<any[]>('/operational-resources')
export const addInventory=(body:unknown)=>notifyRequest('/operational-resources',{method:'POST',body})

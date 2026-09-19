import { notifyRequest } from './client'

export interface GovernanceDashboard {
  auditEvents: number
  unresolvedSyncConflicts: number
  legalHoldEvidence: number
  activeLeases: Array<{ leaseKey: string; ownerId: string; fencingToken: number; expiresAt: string }>
  models: Array<{ releaseId: string; modelName: string; version: string; status: string }>
  agencies: Array<{ agencyId: string; agencyCode: string; name: string; trustStatus: string }>
  security: { secretProvider: string; externalSecretManagerConfigured: boolean; mtlsConfigured: boolean; failClosed: boolean; warnings: string[] }
}

export const getGovernance = () => notifyRequest<GovernanceDashboard>('/governance')
export const verifyAudit = () => notifyRequest<{ valid: boolean; checked: number; headHash?: string; brokenAt?: number }>('/governance/audit/verify')
export const addRetentionPolicy = (body: unknown) => notifyRequest('/governance/retention-policies', { method: 'POST', body })
export const startRecoveryRun = (body: unknown) => notifyRequest('/governance/recovery-runs', { method: 'POST', body })

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

export interface AssuranceOverview {
  retention: Array<{ executionId: string; status: string; candidateCount: number; executedCount: number; createdAt: string }>
  retentionPolicies: Array<{ policyId: string; dataCategory: string; retentionDays: number; action: string; legalHold: boolean; enabled: boolean }>
  circuits: Array<{ providerKey: string; state: string; consecutiveFailures: number; lastError?: string }>
  certificates: Array<{ serviceName: string; notAfter: string; source: string }>
  pendingApprovals: number
  fieldDevices: { total: number; verified: number }
  deviceList: Array<{ deviceRegistrationId: string; platform: string; attestationStatus: string; encryptionCapability?: string; backgroundLocationEnabled: boolean; lastSeenAt: string }>
  slo: Array<{ metricKey: string; name: string; targetRatio: number; actualRatio: number | null; goodCount: number; totalCount: number }>
}
export const getAssurance = () => notifyRequest<AssuranceOverview>('/assurance')
export const previewRetention = (policyId: string) => notifyRequest(`/assurance/retention/${policyId}/preview`, { method: 'POST' })
export const approveRetention = (executionId: string) => notifyRequest(`/assurance/retention/executions/${executionId}/approve`, { method: 'POST' })
export const executeRetention = (executionId: string) => notifyRequest(`/assurance/retention/executions/${executionId}/execute`, { method: 'POST' })
export const deviceAction = (id: string, action: 'VERIFY' | 'REVOKE' | 'REMOTE_WIPE') => notifyRequest(`/assurance/field-devices/${id}/${action}`, { method: 'POST' })
export const resetCircuit = (provider: string) => notifyRequest(`/assurance/circuits/${encodeURIComponent(provider)}/reset`, { method: 'POST' })

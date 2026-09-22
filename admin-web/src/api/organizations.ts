import { apiRequest } from './client'
import type { AccountCreatedResponse, OrganizationResponse, OrganizationType } from '../types'

export function listOrganizations(): Promise<OrganizationResponse[]> {
  return apiRequest<OrganizationResponse[]>('/api/v1/organizations')
}

export interface OrganizationCreateInput {
  code: string
  name: string
  type: OrganizationType
}

export function createOrganization(input: OrganizationCreateInput): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>('/api/v1/organizations', { method: 'POST', body: input })
}

export interface OrganizationAdminAccountInput {
  name: string
  badgeNumber: string
  team?: string
  phone?: string
}

export function issueFirstAdmin(
  organizationId: string,
  input: OrganizationAdminAccountInput,
): Promise<AccountCreatedResponse> {
  return apiRequest<AccountCreatedResponse>(`/api/v1/organizations/${organizationId}/admin-accounts`, {
    method: 'POST',
    body: input,
  })
}

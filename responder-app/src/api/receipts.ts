import { notifyRequest } from './client'

// A receipt means this app decoded the server response, not that a person read it.
export async function receiveAlerts(incidentId: string, alertIds: string[]): Promise<boolean> {
  const ids = [...new Set(alertIds)]
  for (let offset = 0; offset < ids.length; offset += 200) {
    await notifyRequest(`/incidents/${incidentId}/alerts/receipts`, {
      method: 'POST', body: { alertIds: ids.slice(offset, offset + 200) },
    })
  }
  return true
}

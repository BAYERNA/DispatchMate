import { afterEach, describe, expect, it, vi } from 'vitest'
import { receiveAlerts } from './receipts'

afterEach(() => vi.unstubAllGlobals())
describe('alert receipt retry', () => {
  it('deduplicates alerts and sends bounded batches', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response('', { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const ids = Array.from({ length: 201 }, (_, index) => `id-${index}`)
    await receiveAlerts('incident', [...ids, ids[0]])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[0][1].body).alertIds).toHaveLength(200)
    expect(JSON.parse(fetch.mock.calls[1][1].body).alertIds).toEqual(['id-200'])
  })
  it('surfaces failure and can resend the same batch after reconnect', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    await expect(receiveAlerts('incident', ['alert'])).rejects.toThrow()
    await expect(receiveAlerts('incident', ['alert'])).resolves.toBe(true)
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body)
  })
})

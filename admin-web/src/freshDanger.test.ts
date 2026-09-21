import { describe, it, expect } from 'vitest'
import { freshDanger } from './freshDanger'
describe('freshDanger', () => {
  const safe = {dangerLevel: 'SAFE', dangerScore: 0, reason: null}
  it('keeps only fresh successful results', () => {
    expect(freshDanger(safe, false, 1000, 2000)).toBe(safe)
  })
  it('does not display cached SAFE after refresh failure', () => {
    expect(freshDanger(safe, true, 1000, 2000)?.dangerLevel).toBe('UNKNOWN')
  })
  it('expires stale data even without a failed request', () => {
    expect(freshDanger(safe, false, 1000, 31001)?.dangerLevel).toBe('UNKNOWN')
  })
  it('does not fabricate a result before the first response', () => {
    expect(freshDanger(undefined, false, 0, 2000)).toBeUndefined()
  })
})

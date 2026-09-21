import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useIncidentSocket } from './useIncidentSocket'

const mock = vi.hoisted(() => ({ listeners: new Map<string, Set<(...args: unknown[]) => void>>() }))
vi.mock('socket.io-client', () => ({io: () => ({
  connected: false,
  on: (event: string, callback: (...args: unknown[]) => void) => {
    if (!mock.listeners.has(event)) mock.listeners.set(event,new Set())
    mock.listeners.get(event)!.add(callback)
  },
  off: (event: string, callback: (...args: unknown[]) => void) => mock.listeners.get(event)?.delete(callback),
  emit: vi.fn(), disconnect: vi.fn(),
})}))
afterEach(() => {cleanup();mock.listeners.clear();localStorage.clear()})

describe('reconnect recovery', () => {
  it('refreshes persisted history on every connect, including a reconnect without a new event', () => {
    localStorage.setItem('faind.accessToken','session')
    const client = new QueryClient()
    const invalidate = vi.spyOn(client,'invalidateQueries')
    const wrapper = ({children}: {children: ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    renderHook(()=>useIncidentSocket('incident'),{wrapper})
    act(()=>mock.listeners.get('connect')?.forEach(callback=>callback()))
    expect(invalidate).toHaveBeenCalledWith({queryKey:['alerts']})
    invalidate.mockClear()
    act(()=>mock.listeners.get('disconnect')?.forEach(callback=>callback()))
    act(()=>mock.listeners.get('connect')?.forEach(callback=>callback()))
    expect(invalidate).toHaveBeenCalledWith({queryKey:['alerts']})
    expect(invalidate).toHaveBeenCalledWith({queryKey:['ack-freshness']})
  })
})

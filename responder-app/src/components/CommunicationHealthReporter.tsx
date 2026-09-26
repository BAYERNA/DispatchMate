import { useCallback, useEffect, useRef, useState } from 'react'
import { reportCommunicationHeartbeat } from '../api/advancedOperations'

type NetworkInformation = {
  type?: string
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

function clientId() {
  const key = 'dispatchmate.communication-client-id'
  const current = localStorage.getItem(key)
  if (current) return current
  const created = `web-${crypto.randomUUID()}`
  localStorage.setItem(key, created)
  return created
}

function networkDetails() {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  const cellular = connection?.type === 'cellular' || ['2g', '3g', '4g', '5g'].includes(connection?.effectiveType ?? '')
  return {
    transport: connection?.type === 'wifi' ? 'WIFI' : cellular ? 'CELLULAR' : 'UNKNOWN',
    downlinkMbps: connection?.downlink,
    rttMs: connection?.rtt,
    diagnostics: { effectiveType: connection?.effectiveType, saveData: connection?.saveData ?? false },
  }
}

export function CommunicationHealthReporter({ incidentId, socketConnected }: { incidentId: string; socketConnected: boolean }) {
  const [state, setState] = useState<'CONNECTED' | 'DEGRADED' | 'OFFLINE' | 'RECOVERING'>(navigator.onLine ? 'DEGRADED' : 'OFFLINE')
  const [lastSentAt, setLastSentAt] = useState<string | null>(null)
  const recovering = useRef(false)

  const send = useCallback(async () => {
    if (!navigator.onLine) { setState('OFFLINE'); return }
    const nextState = recovering.current ? 'RECOVERING' : socketConnected ? 'CONNECTED' : 'DEGRADED'
    setState(nextState)
    try {
      const result = await reportCommunicationHeartbeat(incidentId, {
        clientId: clientId(), state: nextState, socketConnected, clientOnline: true, ...networkDetails(),
      })
      recovering.current = false
      setState(result.effectiveState as 'CONNECTED' | 'DEGRADED')
      setLastSentAt(result.lastHeartbeatAt)
    } catch { setState(navigator.onLine ? 'DEGRADED' : 'OFFLINE') }
  }, [incidentId, socketConnected])

  useEffect(() => {
    const kickoff = window.setTimeout(() => void send(), 0)
    const timer = window.setInterval(() => void send(), 15_000)
    const online = () => { recovering.current = true; void send() }
    const offline = () => setState('OFFLINE')
    const visibility = () => { if (document.visibilityState === 'visible') void send() }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [send])

  const label = { CONNECTED: '정상', DEGRADED: '저하', OFFLINE: '단절', RECOVERING: '복구 중' }[state]
  return <div className={`communication-health ${state.toLowerCase()}`} role="status">
    통신 {label}{lastSentAt && <span> · 마지막 보고 {new Date(lastSentAt).toLocaleTimeString('ko-KR')}</span>}
  </div>
}

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getStoredToken } from '../api/client'
import type { AlertResponse } from '../types'
import { useQueryClient } from '@tanstack/react-query'

interface AlertAcknowledgedPayload {
  alertId: string
  userId: string
  acknowledgedAt: string
}

interface ReportDraftCreatedPayload {
  incidentId: string
  reportId: string
}

// CMD-002가 구독하는 실시간 채널. notification-server README: incident:{id} 룸에 join하면
// alert:created/alert:acknowledged를, 접속 시 자동 합류하는 user:{userId} 룸에서는
// report:draft-created를 받는다. dev server의 vite.config.ts가 /socket.io를 프록시한다.
export function useIncidentSocket(incidentId: string | undefined) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)
  const [latestAlert, setLatestAlert] = useState<AlertResponse | null>(null)
  const [latestAck, setLatestAck] = useState<AlertAcknowledgedPayload | null>(null)
  const [latestReportDraft, setLatestReportDraft] = useState<ReportDraftCreatedPayload | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const token = getStoredToken()
    if (!token) return

    const socket = io({ auth: { token }, path: '/socket.io' })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['ack-freshness'] })
      void queryClient.invalidateQueries({ queryKey: ['alert-deliveries'] })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('alert:created', (payload: AlertResponse) => setLatestAlert(payload))
    socket.on('alert:acknowledged', (payload: AlertAcknowledgedPayload) => {
      setLatestAck(payload)
      void queryClient.invalidateQueries({ queryKey: ['alert-deliveries'] })
    })
    socket.on('report:draft-created', (payload: ReportDraftCreatedPayload) => setLatestReportDraft(payload))

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [queryClient])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || !incidentId) return

    function join() {
      socket!.emit('join', incidentId)
    }

    if (socket.connected) join()
    socket.on('connect', join)

    return () => {
      socket.off('connect', join)
      socket.emit('leave', incidentId)
    }
  }, [incidentId, connected])

  return { connected, latestAlert, latestAck, latestReportDraft }
}

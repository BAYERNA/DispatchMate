import { useState } from 'react'
import { notifyRequest } from '../api/client'
import { nativeBridge } from '../native/nativeBridge'

const KEY = 'faind.deviceFingerprint.v1'
function fingerprint() {
  const existing = localStorage.getItem(KEY)
  if (existing) return existing
  const value = crypto.randomUUID()
  localStorage.setItem(KEY, value)
  return value
}

export function DeviceAssurance() {
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const register = async () => {
    setPending(true)
    try {
      const native= nativeBridge()
      const attestation=native ? await native.getAttestation() : { platform: 'WEB' as const, deviceFingerprint: fingerprint(), encryptionCapability: crypto.subtle ? 'WEBCRYPTO' : 'NONE' }
      const result = await notifyRequest<{ attestationStatus: string }>('/assurance/field-devices', { method: 'POST', body: { ...attestation, backgroundLocationEnabled: Boolean(native) } })
      setStatus(result.attestationStatus === 'VERIFIED' ? '검증됨' : '관리자 검증 대기')
    } catch (error) { setStatus(error instanceof Error ? error.message : '등록 실패') }
    finally { setPending(false) }
  }
  return <div className="device-assurance"><button type="button" className="wf-btn small" disabled={pending} onClick={register}>이 기기 보안 등록</button>{status && <span aria-live="polite">{status}</span>}</div>
}

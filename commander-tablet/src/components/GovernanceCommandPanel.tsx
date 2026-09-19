import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { addTranscript, createPublicStatusToken, forecastResources, preserveEvidence } from '../api/advancedOperations'

export function GovernanceCommandPanel({ incidentId }: { incidentId: string }) {
  const [transcript, setTranscript] = useState('')
  const [evidenceUri, setEvidenceUri] = useState('')
  const [evidenceHash, setEvidenceHash] = useState('')
  const [result, setResult] = useState('')
  const action = useMutation({
    mutationFn: ({ kind }: { kind: 'forecast' | 'transcript' | 'evidence' | 'public' }) => {
      if (kind === 'forecast') return forecastResources(incidentId)
      if (kind === 'transcript') return addTranscript(incidentId, { channelLabel: '지휘망', transcript, startedAt: new Date().toISOString() })
      if (kind === 'evidence') return preserveEvidence(incidentId, { evidenceType: 'VIDEO', sourceUri: evidenceUri, contentHash: evidenceHash, legalHold: true })
      return createPublicStatusToken(incidentId)
    },
    onSuccess: (value: any) => setResult(value?.token ? `시설 담당자 토큰(1회 표시): ${value.token}` : JSON.stringify(value)),
    onError: error => setResult(error instanceof Error ? error.message : '작업 실패'),
  })
  return <div className="wf" style={{ marginTop: 14 }}>
    <div className="wf-header"><span>증거·무전·자원 예측·시설 공유</span></div>
    <div className="wf-body">
      <div className="form-row">
        <button className="wf-btn" onClick={() => action.mutate({ kind: 'forecast' })}>60분 자원 예측</button>
        <button className="wf-btn" onClick={() => action.mutate({ kind: 'public' })}>30분 시설 공유 토큰</button>
      </div>
      <div className="form-row">
        <input className="wf-field" value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="검토할 무전 전사" />
        <button className="wf-btn" disabled={!transcript.trim()} onClick={() => action.mutate({ kind: 'transcript' })}>전사 보존</button>
      </div>
      <div className="form-row">
        <input className="wf-field" value={evidenceUri} onChange={event => setEvidenceUri(event.target.value)} placeholder="증거 URI" />
        <input className="wf-field" value={evidenceHash} onChange={event => setEvidenceHash(event.target.value)} placeholder="SHA-256 (64자)" />
        <button className="wf-btn" disabled={!evidenceUri.trim() || !/^[a-f0-9]{64}$/i.test(evidenceHash)} onClick={() => action.mutate({ kind: 'evidence' })}>법적 보존</button>
      </div>
      {result && <output className="alert-meta" aria-live="polite">{result}</output>}
      <div className="alert-meta">예측은 자동 배치하지 않습니다. 공유 토큰은 허용된 사건 상태만 노출합니다.</div>
    </div>
  </div>
}

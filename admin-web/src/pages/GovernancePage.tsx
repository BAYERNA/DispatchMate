import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addRetentionPolicy, getGovernance, startRecoveryRun, verifyAudit } from '../api/governance'
import { AdminLayout } from '../components/AdminLayout'
import { StatCard } from '../components/StatCard'

export function GovernancePage() {
  const client = useQueryClient()
  const dashboard = useQuery({ queryKey: ['governance'], queryFn: getGovernance, refetchInterval: 30_000 })
  const [result, setResult] = useState('')
  const mutation = useMutation({
    mutationFn: async ({ kind }: { kind: 'audit' | 'retention' | 'chaos' }) => {
      if (kind === 'audit') return verifyAudit()
      if (kind === 'retention') return addRetentionPolicy({ dataCategory: 'location_history', retentionDays: 90, action: 'DELETE' })
      return startRecoveryRun({ runType: 'CHAOS', targetEnvironment: 'staging' })
    },
    onSuccess: (value) => {
      setResult(JSON.stringify(value))
      void client.invalidateQueries({ queryKey: ['governance'] })
    },
    onError: (error) => setResult(error instanceof Error ? error.message : '작업 실패'),
  })
  const data = dashboard.data
  return <AdminLayout screenId="ADM-GOV" title="복원력·보안·데이터 거버넌스">
    <div className="stat-grid">
      <StatCard value={data?.auditEvents ?? 0} label="불변 감사 이벤트" />
      <StatCard value={data?.unresolvedSyncConflicts ?? 0} label="동기화 충돌" />
      <StatCard value={data?.legalHoldEvidence ?? 0} label="법적 보존 증거" />
      <StatCard value={data?.activeLeases.length ?? 0} label="클러스터 리스" />
    </div>
    <section className="wf" style={{ marginTop: 14 }}>
      <div className="wf-header"><span>Zero Trust 준비 상태</span></div>
      <div className="wf-body">
        <div>Secret provider: <strong>{data?.security.secretProvider ?? '확인 중'}</strong></div>
        <div className="alert-meta">외부 비밀 관리자 {data?.security.externalSecretManagerConfigured ? '연결됨' : '미연결'} · mTLS {data?.security.mtlsConfigured ? '설정됨' : '미설정'} · Fail-closed {data?.security.failClosed ? '활성' : '비활성'}</div>
        {data?.security.warnings.map(warning => <div className="alert-meta" key={warning}>⚠ {warning}</div>)}
      </div>
    </section>
    <section className="wf" style={{ marginTop: 14 }}>
      <div className="wf-header"><span>검증·복구 훈련</span></div>
      <div className="wf-body">
        <div className="form-row">
          <button className="wf-btn" onClick={() => mutation.mutate({ kind: 'audit' })}>감사 체인 검증</button>
          <button className="wf-btn" onClick={() => mutation.mutate({ kind: 'retention' })}>위치 보존정책 적용</button>
          <button className="wf-btn" onClick={() => mutation.mutate({ kind: 'chaos' })}>스테이징 Chaos 계획</button>
        </div>
        {result && <output className="alert-meta" aria-live="polite">{result}</output>}
        <div className="alert-meta">Chaos 실행은 계획만 등록합니다. 실제 장애 주입은 승인된 스테이징 워커가 수행해야 합니다.</div>
      </div>
    </section>
    <section className="wf" style={{ marginTop: 14 }}>
      <div className="wf-header"><span>AI 릴리스·기관 연합</span></div>
      <div className="wf-body">
        <div className="alert-meta">모델 {data?.models.length ?? 0}개 · 등록 기관 {data?.agencies.length ?? 0}곳</div>
        {(data?.models ?? []).map(model => <div key={model.releaseId}>{model.modelName} {model.version} — {model.status}</div>)}
        {(data?.agencies ?? []).map(agency => <div key={agency.agencyId}>{agency.name} — {agency.trustStatus}</div>)}
      </div>
    </section>
  </AdminLayout>
}

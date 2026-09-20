import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { addRetentionPolicy, approveRetention, deviceAction, executeRetention, getAssurance, getGovernance, previewRetention, resetCircuit, startRecoveryRun, verifyAudit } from '../api/governance'
import { AdminLayout } from '../components/AdminLayout'
import { StatCard } from '../components/StatCard'

export function GovernancePage() {
  const client = useQueryClient()
  const dashboard = useQuery({ queryKey: ['governance'], queryFn: getGovernance, refetchInterval: 30_000 })
  const assurance = useQuery({ queryKey: ['assurance'], queryFn: getAssurance, refetchInterval: 30_000 })
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
  const production = assurance.data
  const retention = useMutation({ mutationFn: ({ action, id }: { action: 'preview' | 'approve' | 'execute'; id: string }) => action === 'preview' ? previewRetention(id) : action === 'approve' ? approveRetention(id) : executeRetention(id), onSuccess: value => { setResult(JSON.stringify(value)); void client.invalidateQueries({ queryKey: ['assurance'] }) }, onError: error => setResult(error instanceof Error ? error.message : '작업 실패') })
  const assuranceAction = useMutation({ mutationFn: ({ kind, id, action }: { kind: 'device' | 'circuit'; id: string; action?: 'VERIFY' | 'REVOKE' | 'REMOTE_WIPE' }) => kind === 'device' ? deviceAction(id, action!) : resetCircuit(id), onSuccess: value => { setResult(JSON.stringify(value)); void client.invalidateQueries({ queryKey: ['assurance'] }) }, onError: error => setResult(error instanceof Error ? error.message : '작업 실패') })
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
      <div className="wf-header"><span>실행 가능한 개인정보 보존정책</span></div>
      <div className="wf-body">
        {(production?.retentionPolicies ?? []).map(policy => <div className="assignment-row" key={policy.policyId}><span>{policy.dataCategory} · {policy.retentionDays}일 · {policy.action}{policy.legalHold ? ' · 법적 보존' : ''}</span><button className="wf-btn small" disabled={!policy.enabled || policy.legalHold} onClick={() => retention.mutate({ action: 'preview', id: policy.policyId })}>미리보기</button></div>)}
        {(production?.retention ?? []).map(execution => <div className="assignment-row" key={execution.executionId}><span>{execution.status} · 후보 {execution.candidateCount}건 · 실행 {execution.executedCount}건</span>{execution.status === 'PREVIEW' && <button className="wf-btn small" onClick={() => retention.mutate({ action: 'approve', id: execution.executionId })}>다른 관리자 승인</button>}{execution.status === 'APPROVED' && <button className="wf-btn small primary" onClick={() => retention.mutate({ action: 'execute', id: execution.executionId })}>정책 실행</button>}</div>)}
        <div className="alert-meta">미리보기를 만든 관리자와 다른 관리자가 승인해야 합니다. ARCHIVE는 외부 WORM 검증 전 실행되지 않습니다.</div>
      </div>
    </section>
    <section className="wf" style={{ marginTop: 14 }}>
      <div className="wf-header"><span>SLO·외부 공급자·인증서</span></div>
      <div className="wf-body">
        {(production?.slo ?? []).map(item => <div key={item.metricKey}>{item.name}: {item.actualRatio == null ? '표본 없음' : `${(item.actualRatio * 100).toFixed(2)}%`} / 목표 {(item.targetRatio * 100).toFixed(2)}%</div>)}
        {(production?.circuits ?? []).map(item => <div className="assignment-row" key={item.providerKey}><span>{item.providerKey} · {item.state} · 연속 실패 {item.consecutiveFailures}</span>{item.state === 'OPEN' && <button className="wf-btn small" onClick={() => assuranceAction.mutate({ kind: 'circuit', id: item.providerKey })}>시험 복구</button>}</div>)}
        {(production?.certificates ?? []).map(item => <div className="alert-meta" key={item.serviceName}>{item.serviceName} 인증서 · {new Date(item.notAfter).toLocaleDateString()} 만료 · {item.source}</div>)}
        <div className="alert-meta">현장 기기 검증 {production?.fieldDevices.verified ?? 0}/{production?.fieldDevices.total ?? 0} · 승인 대기 {production?.pendingApprovals ?? 0}</div>
      </div>
    </section>
    <section className="wf" style={{ marginTop: 14 }}>
      <div className="wf-header"><span>현장 기기 검증·원격 폐기</span></div>
      <div className="wf-body">
        {(production?.deviceList ?? []).map(device => <div className="assignment-row" key={device.deviceRegistrationId}><span>{device.platform} · {device.attestationStatus} · {device.encryptionCapability ?? '암호화 미확인'}</span><span>{device.attestationStatus === 'PENDING' && <button className="wf-btn small" onClick={() => assuranceAction.mutate({ kind: 'device', id: device.deviceRegistrationId, action: 'VERIFY' })}>검증</button>}<button className="wf-btn small" onClick={() => assuranceAction.mutate({ kind: 'device', id: device.deviceRegistrationId, action: 'REMOTE_WIPE' })}>원격 폐기 요청</button></span></div>)}
      </div>
    </section>
    <section className="wf" style={{ marginTop: 14 }}>
      <div className="wf-header"><span>보안 이상징후·공급자 webhook</span></div>
      <div className="wf-body">
        {(production?.securityAnomalies ?? []).map(item => <div className="alert-item" key={item.anomalyId}><strong>위험 {item.riskScore} · {item.anomalyType}</strong> · {item.status}</div>)}
        {!production?.securityAnomalies.length && <div className="alert-meta">열린 보안 이상징후가 없습니다.</div>}
        {(production?.webhookReceipts ?? []).map(item => <div className="alert-meta" key={`${item.providerKey}-${item.processingStatus}`}>{item.providerKey} · {item.processingStatus} · {item.count}건</div>)}
        <div className="alert-meta">암호화 오프라인 첨부 검증 {production?.offlineAssets.verified ?? 0}/{production?.offlineAssets.total ?? 0}</div>
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

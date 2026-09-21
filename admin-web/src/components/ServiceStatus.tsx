import { useQueries } from '@tanstack/react-query'
import { aiStreamRequest, apiRequest } from '../api/client'
import { useNow } from '../useNow'

const checks = [
  { label: '백엔드·계정 DB', run: () => apiRequest('/api/v1/auth/session').then(() => '응답 정상') },
  { label: '알림 서버·DB', run: () => apiRequest<{status: string}>('/notify/health').then(r => r.status === 'UP' ? '응답 정상' : '확인 필요') },
  { label: 'AI 서버·모델', run: () => aiStreamRequest<{service: string; model: string}>('/status').then(r => r.model === 'READY' ? '모델 준비됨' : '모델 사용 불가') },
]
export function ServiceStatus() {
  const now = useNow()
  const results = useQueries({ queries: checks.map(check => ({ queryKey: ['service-status', check.label], queryFn: check.run, refetchInterval: 15000, retry: false })) })
  return <section className="wf" aria-label="서비스 상태" style={{ marginBottom: 14 }}>
    <div className="wf-header">서비스 상태 · 15초마다 확인</div>
    <div className="wf-body">
      {results.map((result, i) => <div key={checks[i].label} role="status">
        {checks[i].label}: {result.isError || (result.dataUpdatedAt > 0 && now - result.dataUpdatedAt > 30000) ? '확인 불가 — 연결·인증 확인 필요' : result.data ?? '확인 중…'}
      </div>)}
      <small>응답 정상은 실제 카메라 감지 정확도나 알림 수신 성공을 보증하지 않습니다.</small>
    </div>
  </section>
}

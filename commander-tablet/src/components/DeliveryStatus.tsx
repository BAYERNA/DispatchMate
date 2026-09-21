import type { AlertDeliveryStatus } from '../api/alerts'

export function DeliveryStatus({ status }: { status: AlertDeliveryStatus | undefined }) {
  if (!status) return <div>전달 현황 확인 중…</div>
  if (!status.tracked) return <div>이전 알림: 발송 당시 대상자·수신 기록 없음</div>
  if (!status.recipients.length) return <div>발송 당시 수신 대상 대원 없음</div>
  const waiting = status.recipients.filter(person => !person.receivedAt)
  const unread = status.recipients.filter(person => person.receivedAt && !person.acknowledgedAt)
  const confirmed = status.recipients.filter(person => person.acknowledgedAt)
  return <details>
    <summary>대상 {status.recipients.length}명 · 미수신 {waiting.length} · 수신 후 미확인 {unread.length} · 확인 {confirmed.length}</summary>
    <p>앱 수신과 대원의 확인은 별도로 기록됩니다. 대상자는 발송 시점 기준입니다.</p>
    <ul>{status.recipients.map(person => <li key={person.userId}>
      {person.name} ({person.userId.slice(0, 8)}) — {person.acknowledgedAt ? '확인 완료' : person.receivedAt ? '앱 수신 · 확인 대기' : '미수신 · 앱 연결 시 재동기화'}
    </li>)}</ul>
  </details>
}

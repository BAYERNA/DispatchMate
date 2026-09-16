// NFR-02: 저장/제출 성공·실패를 항상 명시적으로 표시한다.
// role="alert"/"status" — 스크린 리더가 폼 제출 결과를 별도 포커스 이동 없이 바로 읽어주도록.
// error는 assertive(즉시 끼어들어 읽음), success는 polite(현재 낭독이 끝난 뒤 읽음)가 적절하다.
export function Banner({ kind, message }: { kind: 'error' | 'success'; message: string }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}>
      {message}
    </div>
  )
}

import * as Sentry from '@sentry/react'

// VITE_SENTRY_DSN이 없으면(로컬 개발, DSN 미발급 환경) 아무 것도 하지 않는다 — Sentry.init을
// 아예 호출하지 않으면 captureException 등 나머지 API도 조용히 no-op으로 동작한다.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}

export { Sentry }

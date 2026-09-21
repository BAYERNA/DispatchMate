import { useEffect, useState, type CSSProperties } from 'react'
import { getStoredToken } from '../api/client'

// Fetch with Authorization headers, never put long-lived JWTs in URLs.
// Each frame rechecks account/camera authorization and drops stale images on error.
export function SecureCamera({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }) {
  const [frame, setFrame] = useState<{ src: string; url: string } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let stopped = false
    let objectUrl: string | undefined
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    async function refresh() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 10000)
      try {
        const token = getStoredToken()
        if (!token) throw new Error('로그인이 필요합니다.')
        const response = await fetch(src, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error('영상 획득 실패')
        const blob = await response.blob()
        if (stopped) return
        const next = URL.createObjectURL(blob)
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = next
        setFrame({ src, url: next })
        setError(false)
      } catch {
        if (!stopped) { setFrame(null); setError(true) }
      } finally {
        clearTimeout(timeout)
        if (!stopped) timer = setTimeout(refresh, 1000)
      }
    }
    void refresh()
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src])
  return <div>
    {frame?.src === src ? <img src={frame.url} alt={alt} style={style} /> : <div role="status">{error ? '영상 확인 불가 — 권한·카메라 연결을 확인하세요.' : '영상 연결 중…'}</div>}
    <small>인증된 미리보기 · 약 1초 간격 갱신</small>
  </div>
}


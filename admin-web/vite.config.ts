import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 백엔드가 /api/v1로 노출하는 API를 프록시한다 — 실서비스에서는 Spring Cloud Gateway가
// 맡을 라우팅을, 데모 단계에서는 dev server가 대신한다 (기술스택 §4 "API 진입점" 참조).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    // e2e/*.spec.ts는 Playwright 전용(별도 playwright.config.ts) — vitest 기본 include 패턴이
    // *.spec.ts도 잡아서 여기 명시적으로 src의 *.test.ts(x)만 대상으로 좁힌다.
    include: ['src/**/*.test.{ts,tsx}'],
  },
  server: {
    port: 5173,
    proxy: {
      '/notify': {
        target: process.env.VITE_NOTIFICATION_URL ?? 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/notify/, ''),
      },
      '/api': {
        target: process.env.VITE_BACKEND_URL ?? 'http://localhost:8080',
        changeOrigin: true,
      },
      // ADM-010 전체 CCTV 상시 감시(Phase 4) — ai-server의 MJPEG 중계·위험도 스냅샷 엔드포인트로
      // 프록시한다. commander-tablet의 CMD-002 라이브 카메라 뷰와 동일한 패턴.
      '/ai-stream': {
        target: process.env.VITE_AI_SERVER_URL ?? 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai-stream/, '/api/v1/streams'),
      },
    },
  },
})

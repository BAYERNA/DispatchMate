import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServiceStatus } from './ServiceStatus'
afterEach(()=>{cleanup(); vi.unstubAllGlobals()})
describe('ServiceStatus',()=>{
  it('distinguishes a responding service from an unavailable model',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('/status')?{service:'UP',model:'UNAVAILABLE'}:{status:'UP'}),{status:200})))
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
    render(<QueryClientProvider client={client}><ServiceStatus /></QueryClientProvider>)
    await waitFor(()=>expect(screen.getByText(/AI 서버·모델: 모델 사용 불가/)).toBeTruthy())
    expect(screen.getByText(/알림 서버·DB: 응답 정상/)).toBeTruthy()
    client.clear()
  })
})

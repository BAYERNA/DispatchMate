import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { login } from './auth'

describe('login response validation',()=>{
  beforeEach(()=>{localStorage.clear();globalThis.fetch=vi.fn()})
  afterEach(()=>vi.restoreAllMocks())

  it('accepts the documented login contract',async()=>{
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({accessToken:'token',userId:'00000000-0000-4000-8000-000000000001',name:'관리자',role:'ADMIN',initialPassword:false}),{status:200}))
    await expect(login('0001','password')).resolves.toMatchObject({role:'ADMIN',initialPassword:false})
  })

  it('rejects a malformed server response before it reaches auth state',async()=>{
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({accessToken:'token',userId:'not-a-uuid',name:'관리자',role:'ROOT'}),{status:200}))
    await expect(login('0001','password')).rejects.toThrow()
  })
})

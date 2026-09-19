import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { SecureCamera } from './SecureCamera'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
describe('SecureCamera', () => {
  it('sends credentials only in the header and displays a blob image', async () => {
    localStorage.setItem('faind.accessToken', 'test-session')
    const fetch = vi.fn().mockResolvedValue({ok:true,headers:new Headers({'content-type':'image/jpeg'}),blob:async()=>new Blob(['frame'])})
    vi.stubGlobal('fetch', fetch)
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-image')
    URL.revokeObjectURL = vi.fn()
    render(<SecureCamera src="/ai-stream/frame?device_id=camera" alt="camera preview" />)
    await waitFor(()=>expect(screen.getByAltText('camera preview').getAttribute('src')).toBe('blob:test-image'))
    expect(fetch).toHaveBeenCalledWith('/ai-stream/frame?device_id=camera',expect.objectContaining({headers:{Authorization:'Bearer test-session'}}))
  })
  it('does not display a camera after authentication fails', async () => {
    localStorage.setItem('faind.accessToken', 'test-session')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:403}))
    render(<SecureCamera src="/ai-stream/frame?device_id=camera" alt="camera preview" />)
    await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('영상 확인 불가'))
    expect(screen.queryByAltText('camera preview')).toBeNull()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DeliveryStatus } from './DeliveryStatus'

afterEach(cleanup)
describe('DeliveryStatus', () => {
  it('distinguishes machine receipt from human confirmation', () => {
    render(<DeliveryStatus status={{ alertId:'a',tracked:true,recipients:[
      {userId:'1',name:'대원 가',queuedAt:'now',receivedAt:null,acknowledgedAt:null},
      {userId:'2',name:'대원 나',queuedAt:'now',receivedAt:'now',acknowledgedAt:null},
      {userId:'3',name:'대원 다',queuedAt:'now',receivedAt:'now',acknowledgedAt:'now'},
    ]}} />)
    expect(screen.getByText('대상 3명 · 미수신 1 · 수신 후 미확인 1 · 확인 1')).toBeTruthy()
    expect(screen.getByText(/대원 나.*앱 수신 · 확인 대기/)).toBeTruthy()
  })
  it('does not present old alerts as successfully delivered', () => {
    render(<DeliveryStatus status={{alertId:'old',tracked:false,recipients:[]}} />)
    expect(screen.getByText(/발송 당시 대상자·수신 기록 없음/)).toBeTruthy()
  })
})

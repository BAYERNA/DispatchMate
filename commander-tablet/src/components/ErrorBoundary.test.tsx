import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): never {
  throw new Error('boom')
}

// 렌더링 중 예외가 나도 화면 전체가 백지가 되지 않고, 복구 UI(새로고침 버튼)가 뜨는지 검증한다.
describe('ErrorBoundary', () => {
  it('자식이 정상이면 그대로 렌더링한다', () => {
    render(
      <ErrorBoundary>
        <div>정상 화면</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('정상 화면')).toBeTruthy()
  })

  it('자식이 렌더링 중 예외를 던지면 백지 대신 복구 UI를 보여준다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByText('예상치 못한 오류')).toBeTruthy()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()

    vi.restoreAllMocks()
  })
})

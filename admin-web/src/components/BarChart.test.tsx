import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarChart } from './BarChart'

describe('BarChart', () => {
  it('데이터가 없으면 안내 문구를 보여주고 차트를 렌더링하지 않는다', () => {
    const { container } = render(<BarChart data={[]} label="월별 AI 판단 빈도" />)
    expect(within(container).getByText('데이터가 없습니다.')).toBeTruthy()
  })

  it('데이터가 있으면 recharts 막대그래프를 렌더링한다', () => {
    const { container } = render(
      <BarChart data={[{ label: '1월', count: 3 }, { label: '2월', count: 7 }]} label="월별 AI 판단 빈도" />,
    )
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy()
    expect(within(container).getByText('월별 AI 판단 빈도')).toBeTruthy()
  })
})

import { Bar, BarChart as RechartsBarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LabeledCount } from '../types'

// 값이 0건이어도 막대 자체는 항상 렌더링해 "데이터 없음"과 "차트 자체가 깨짐"을 시각적으로
// 구분한다. 색상은 임의의 recharts 기본값이 아니라 design-system 토큰을 그대로 쓴다.
export function BarChart({ data, label }: { data: LabeledCount[]; label: string }) {
  return (
    <div className="wf-chart">
      <div className="chart-label">{label}</div>
      {data.length === 0 ? (
        <div className="spinner-text">데이터가 없습니다.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" opacity={0.3} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-line)' }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--color-ink-soft)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-fill)' }}
              formatter={(value) => [`${value}건`, label]}
              contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', fontSize: 12 }}
            />
            <Bar dataKey="count" fill="var(--color-role-responder)" radius={[3, 3, 0, 0]} />
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

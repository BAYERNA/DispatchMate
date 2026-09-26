import { Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts'
import type { LabeledCount } from '../types'

export default function RechartsBars({data}:{data:LabeledCount[]}){
  return <ResponsiveContainer width="100%" height={240}>
    <BarChart data={data} margin={{top:12,right:12,left:0,bottom:8}} accessibilityLayer>
      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
      <XAxis dataKey="label" tick={{fontSize:12}} interval={0}/>
      <YAxis allowDecimals={false} width={36}/>
      <Tooltip formatter={(value)=>[`${value}건`,'건수']}/>
      <Bar dataKey="count" fill="var(--color-primary)" radius={[6,6,0,0]}/>
    </BarChart>
  </ResponsiveContainer>
}

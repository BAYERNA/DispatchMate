import type { Meta,StoryObj } from '@storybook/react-vite'

function DesignSystem({state}:{state:'default'|'danger'|'success'}){
  const className=state==='danger'?'danger':state==='success'?'primary':''
  return <div style={{width:420,display:'grid',gap:16}}>
    <section className="wf">
      <div className={`wf-header ${state==='danger'?'alert':''}`}><span>출동메이트 공통 패널</span></div>
      <div className="wf-body"><div className={`banner ${state==='danger'?'error':state==='success'?'success':''}`}>현장 상태 메시지</div></div>
    </section>
    <div className="form-row"><input className="wf-field" defaultValue="대원 상태" aria-label="예시 입력"/><button className={`wf-btn ${className}`}>확인</button></div>
  </div>
}

const meta={title:'DispatchMate/Foundation',component:DesignSystem,args:{state:'default'},argTypes:{state:{control:'select',options:['default','danger','success']}}} satisfies Meta<typeof DesignSystem>
export default meta
type Story=StoryObj<typeof meta>
export const Default:Story={}
export const Danger:Story={args:{state:'danger'}}
export const Success:Story={args:{state:'success'}}

import { InternalWebhookGuard } from './internal-webhook.guard';
describe('InternalWebhookGuard', () => {
  const context = (authorization?:string):any => ({switchToHttp:()=>({getRequest:()=>({headers:{authorization}})})});
  it('fails closed when unconfigured', () => {
    expect(()=>new InternalWebhookGuard({get:()=>''} as any).canActivate(context())).toThrow();
  });
  it('rejects absent and incorrect bearer values', () => {
    const guard=new InternalWebhookGuard({get:()=> 'expected'} as any);
    expect(()=>guard.canActivate(context())).toThrow();
    expect(()=>guard.canActivate(context('Bearer wrong'))).toThrow();
    expect(guard.canActivate(context('Bearer expected'))).toBe(true);
  });
});

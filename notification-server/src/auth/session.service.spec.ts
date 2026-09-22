import * as jwt from 'jsonwebtoken';
import { SessionService } from './session.service';
describe('SessionService', () => {
  const secret = 'local-test-secret'.repeat(5);
  const token = () => jwt.sign({role:'RESPONDER',badgeNumber:'b'},secret,{algorithm:'HS512',subject:'u',expiresIn:60});
  let service: SessionService;
  beforeEach(() => { service = new SessionService({getOrThrow:()=>secret,get:()=> 'http://backend:8080'} as any); });
  afterEach(() => jest.restoreAllMocks());
  it('checks current backend state after signature verification', async () => {
    const fetch = jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({userId:'u',role:'RESPONDER',organizationId:'org-1'})} as Response);
    await expect(service.verify(token())).resolves.toMatchObject({userId:'u',organizationId:'org-1'});
    expect(fetch).toHaveBeenCalledWith('http://backend:8080/api/v1/auth/session',expect.objectContaining({headers:{Authorization:expect.stringMatching(/^Bearer /)}}));
  });
  it('rejects when backend session response is missing organizationId', async () => {
    jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({userId:'u',role:'RESPONDER'})} as Response);
    await expect(service.verify(token())).rejects.toThrow();
  });
  it('rejects revoked account sessions and fails closed on backend outage', async () => {
    jest.spyOn(global,'fetch').mockResolvedValue({ok:false,status:403} as Response);
    await expect(service.verify(token())).rejects.toThrow();
    jest.mocked(global.fetch).mockRejectedValue(new Error('unavailable'));
    await expect(service.verify(token())).rejects.toThrow();
  });
  it('rejects expired tokens without contacting backend', async () => {
    const fetch = jest.spyOn(global,'fetch');
    const expired=jwt.sign({role:'ADMIN'},secret,{algorithm:'HS512',subject:'u',expiresIn:-1});
    await expect(service.verify(expired)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

import { AlertsGateway } from './alerts.gateway';
const incidentId = '00000000-0000-4000-8000-000000000001';
describe('AlertsGateway', () => {
  const user = { userId: 'u', role: 'RESPONDER', badgeNumber: 'b' };
  let sessions: any, access: any, gateway: AlertsGateway, client: any;
  beforeEach(() => {
    sessions = { verify: jest.fn().mockResolvedValue(user) };
    access = { require: jest.fn().mockResolvedValue(undefined) };
    gateway = new AlertsGateway(sessions, access);
    client = { id: 's', handshake: { auth: { token: 'test-token' } }, data: {}, connected: true,
      rooms: new Set([`incident:${incidentId}`]), join: jest.fn(), leave: jest.fn(), emit: jest.fn(), disconnect: jest.fn() };
    gateway.server = { sockets: { adapter: { rooms: new Map([[`incident:${incidentId}`, new Set(['s'])]]) }, sockets: new Map([['s',client]]) } } as any;
  });
  it('joins only after current session and assignment validation', async () => {
    await gateway.handleJoin(client, incidentId);
    expect(access.require).toHaveBeenCalledWith(user, incidentId);
    expect(client.join).toHaveBeenCalledWith(`incident:${incidentId}`);
  });
  it('denies removed assignments', async () => {
    access.require.mockRejectedValue(new Error());
    await gateway.handleJoin(client, incidentId);
    expect(client.join).not.toHaveBeenCalled();
  });
  it('denies expired/revoked tokens', async () => {
    sessions.verify.mockRejectedValue(new Error());
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
  it('does not deliver to a previously joined but revoked session', async () => {
    sessions.verify.mockRejectedValue(new Error());
    await (gateway as any).deliver(`incident:${incidentId}`, 'alert:created', {}, incidentId);
    expect(client.emit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
  it('does not deliver after removal from assignment', async () => {
    access.require.mockRejectedValue(new Error());
    await (gateway as any).deliver(`incident:${incidentId}`, 'alert:created', {}, incidentId);
    expect(client.emit).not.toHaveBeenCalled();
  });
  it('rejects malformed join payloads', async () => {
    await gateway.handleJoin(client, {} as any);
    expect(client.join).not.toHaveBeenCalled();
    expect(sessions.verify).not.toHaveBeenCalled();
  });
  it('does not leak targeted alerts or confirmations to other responders', async () => {
    for (const event of ['alert:created', 'alert:acknowledged']) {
      await (gateway as any).deliver(`incident:${incidentId}`, event, { targetUserId: 'someone-else' }, incidentId);
    }
    expect(client.emit).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();
    await (gateway as any).deliver(`incident:${incidentId}`, 'alert:created', {targetUserId:'u'}, incidentId);
    expect(client.emit).toHaveBeenCalledTimes(1);
  });
});

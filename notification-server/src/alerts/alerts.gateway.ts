import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { isUUID } from 'class-validator';
import { SessionService } from '../auth/session.service';
import { IncidentAccessService } from './incident-access.service';

@WebSocketGateway({ cors: { origin: false } })
export class AlertsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(AlertsGateway.name);
  @WebSocketServer() server: Server;
  constructor(private readonly sessions: SessionService, private readonly access: IncidentAccessService) {}

  private async authenticate(client: Socket) {
    const token = client.handshake.auth?.token ?? client.handshake.headers.authorization?.replace(/^Bearer /, '');
    if (typeof token !== 'string') throw new Error('Missing token');
    const user = await this.sessions.verify(token);
    client.data.user = user;
    return user;
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const user = await this.authenticate(client);
      if (client.connected) await client.join(`user:${user.userId}`);
    } catch { client.disconnect(true); }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() incidentId: string): Promise<void> {
    try {
      if (typeof incidentId !== 'string' || !isUUID(incidentId)) throw new Error('Invalid incident');
      const user = await this.authenticate(client);
      await this.access.require(user, incidentId);
      await client.join(`incident:${incidentId}`);
    } catch { client.emit('join:denied', { incidentId, reason: '세션 및 출동 접근 권한을 확인하세요.' }); }
  }

  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() incidentId: string): void {
    if (typeof incidentId === 'string') void client.leave(`incident:${incidentId}`);
  }

  // Revalidate before every delivery; an existing room does not confer lasting permission.
  private async deliver(room: string, event: string, payload: unknown, incidentId?: string): Promise<void> {
    const ids = this.server.sockets.adapter.rooms.get(room) ?? new Set<string>();
    await Promise.all([...ids].map(async id => {
      const client = this.server.sockets.sockets.get(id);
      if (!client) return;
      try {
        const user = await this.authenticate(client);
        if (incidentId) await this.access.require(user, incidentId);
        const target = (payload as { targetUserId?: string } | null)?.targetUserId;
        if (target && user.role === 'RESPONDER' && target !== user.userId) return;
        if (client.connected && client.rooms.has(room)) client.emit(event, payload);
      } catch {
        client.disconnect(true);
        this.logger.warn('세션 또는 배정 검증 실패로 알림 연결을 종료했습니다.');
      }
    }));
  }

  broadcastToIncident(incidentId: string, event: string, payload: unknown): void {
    void this.deliver(`incident:${incidentId}`, event, payload, incidentId).catch(() => this.logger.error('알림 전달 실패'));
  }
  broadcastToUser(userId: string, event: string, payload: unknown): void {
    void this.deliver(`user:${userId}`, event, payload).catch(() => this.logger.error('개인 알림 전달 실패'));
  }
}

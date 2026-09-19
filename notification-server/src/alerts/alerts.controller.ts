import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AlertsService } from './alerts.service';
import { IncidentAccessGuard } from './incident-access.guard';
import { CreateAiRiskWarningDto } from './dto/create-ai-risk-warning.dto';
import { CreateEntryInfoDto } from './dto/create-entry-info.dto';
import { CreateRiskWarningDto } from './dto/create-risk-warning.dto';
import { CreateSupplyRequestDto } from './dto/create-supply-request.dto';
import { Alert } from './entities/alert.entity';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { DeliveryService } from './delivery.service';
import { ReceiveAlertsDto } from './dto/receive-alerts.dto';

// USR-001(입력)/CMD-002(수신): FR-18 진입정보, FR-23 지원요청, FR-06 위험알림
@Controller('incidents/:incidentId/alerts')
@UseGuards(JwtAuthGuard, IncidentAccessGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService, private readonly deliveries: DeliveryService) {}

  @Get()
  list(@Param('incidentId', new ParseUUIDPipe()) incidentId: string, @CurrentUser() user: AuthenticatedUser): Promise<Alert[]> {
    return this.alertsService.listByIncident(incidentId, user);
  }

  @Post('receipts')
  receive(@Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @CurrentUser() user: AuthenticatedUser, @Body() dto: ReceiveAlertsDto) {
    return this.deliveries.receive(incidentId, user, dto.alertIds);
  }

  @Get('delivery-status')
  deliveryStatus(@Param('incidentId', new ParseUUIDPipe()) incidentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.deliveries.status(incidentId, user);
  }

  @Post('entry-info')
  createEntryInfo(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEntryInfoDto,
  ): Promise<Alert> {
    return this.alertsService.createEntryInfo(incidentId, user.userId, dto);
  }

  @Post('supply-request')
  createSupplyRequest(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplyRequestDto,
  ): Promise<Alert> {
    return this.alertsService.createSupplyRequest(incidentId, user.userId, dto);
  }

  @Post('risk-warning')
  createRiskWarning(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRiskWarningDto,
  ): Promise<Alert> {
    return this.alertsService.createRiskWarning(incidentId, user.userId, dto);
  }

  // Phase 6: CMD-002가 지켜보는 카메라의 위험도가 CRITICAL로 올라갔을 때 프론트가 대신 보고.
  // /webhook/risk-warning과 결과는 같지만(author_id=NULL, sourceType=AI) 그건 backend↔
  // notification-server 내부 서비스 토큰 전용이라 로그인 세션에서는 못 쓴다 — 그래서 이 경로만
  // 따로 열되, 사람이 쓴 게 아니라는 sourceType은 그대로 유지한다.
  @Post('ai-risk-warning')
  createAiRiskWarning(
    @Param('incidentId', new ParseUUIDPipe()) incidentId: string,
    @Body() dto: CreateAiRiskWarningDto,
  ): Promise<Alert> {
    return this.alertsService.createFromSystem({
      incidentId,
      alertType: 'RISK_WARNING',
      message: dto.message,
      sourceType: 'AI',
    });
  }
}

import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentAccessGuard } from '../alerts/incident-access.guard';
import { AckService } from './ack.service';
import { AlertAcknowledgement } from './entities/alert-acknowledgement.entity';
import { FreshnessDto } from './dto/freshness.dto';

@Controller('alerts/:alertId/acknowledgements')
@UseGuards(JwtAuthGuard, IncidentAccessGuard)
export class AckController {
  constructor(private readonly ackService: AckService) {}

  @Post()
  acknowledge(
    @Param('alertId', new ParseUUIDPipe()) alertId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AlertAcknowledgement> {
    return this.ackService.acknowledge(alertId, user.userId);
  }

  @Get('freshness')
  getFreshness(@Param('alertId', new ParseUUIDPipe()) alertId: string): Promise<FreshnessDto> {
    return this.ackService.getFreshness(alertId);
  }
}

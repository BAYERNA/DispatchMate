import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IncidentAccessGuard } from '../alerts/incident-access.guard';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdvancedOperationsService } from './advanced-operations.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AdvancedOperationsController {
  constructor(private readonly service: AdvancedOperationsService) {}

  @Get('incidents/:incidentId/advanced-operations') @UseGuards(IncidentAccessGuard)
  dashboard(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.dashboard(id, user); }
  @Post('incidents/:incidentId/mayday') @UseGuards(IncidentAccessGuard)
  mayday(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.mayday(id, user, body); }
  @Patch('mayday/:id/status') maydayStatus(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.maydayStatus(id, user, body.status, body.note); }
  @Post('incidents/:incidentId/par') @UseGuards(IncidentAccessGuard)
  par(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.startPar(id, user, body); }
  @Post('par/:id/respond') respond(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.respondPar(id, user, body); }
  @Post('push-subscriptions') push(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.registerPush(user, body); }
  @Post('incidents/:incidentId/routes') @UseGuards(IncidentAccessGuard)
  route(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.route(id, user, body); }
  @Post('incidents/:incidentId/positions') @UseGuards(IncidentAccessGuard)
  position(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.position(id, user, body); }
  @Post('incidents/:incidentId/communications/heartbeat') @UseGuards(IncidentAccessGuard)
  communicationHeartbeat(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.communicationHeartbeat(id, user, body); }
  @Post('resource-tags') tag(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.addTag(user, body); }
  @Post('resource-tags/:tagValue/scan') scan(@Param('tagValue') value: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.scanTag(user, value, body); }
  @Post('hospitals') hospital(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.hospital(user, body); }
  @Post('incidents/:incidentId/handovers') @UseGuards(IncidentAccessGuard)
  handover(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.handover(id, user, body); }
  @Post('incidents/:incidentId/tactical-zones') @UseGuards(IncidentAccessGuard)
  zone(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.zone(id, user, body); }
  @Post('incidents/:incidentId/objectives') @UseGuards(IncidentAccessGuard)
  objective(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.objective(id, user, body); }
  @Patch('objectives/:id/status') objectiveStatus(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.objectiveStatus(id, user, body.status); }
  @Post('incidents/:incidentId/after-action') @UseGuards(IncidentAccessGuard)
  afterAction(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) { return this.service.afterAction(id, user); }
  @Post('incidents/:incidentId/training-from-incident') @UseGuards(IncidentAccessGuard)
  training(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.trainingFromIncident(id, user, body.title); }
  @Post('ai-drift-snapshots') drift(@CurrentUser() user: AuthenticatedUser, @Query('modelName') model?: string) { return this.service.drift(user, model); }
  @Post('incidents/:incidentId/digital-twin') @UseGuards(IncidentAccessGuard)
  twin(@Param('incidentId', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.twin(id, user, body); }
  @Get('operations/metrics') metrics(@CurrentUser() user: AuthenticatedUser) { return this.service.metrics(user); }
  @Get('operations/metrics/prometheus') @Header('Content-Type', 'text/plain; version=0.0.4')
  prometheus(@CurrentUser() user: AuthenticatedUser) { return this.service.prometheus(user); }
  @Post('recovery-policies') recovery(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.recoveryPolicy(user, body); }
}

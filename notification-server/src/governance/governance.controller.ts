import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GovernanceService } from './governance.service';

@Controller('governance')
@UseGuards(JwtAuthGuard)
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}
  @Get() dashboard(@CurrentUser() user: AuthenticatedUser) { return this.service.dashboard(user); }
  @Get('security-readiness') security(@CurrentUser() user: AuthenticatedUser) { return this.service.securityReadiness(user); }
  @Post('audit') audit(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.audit(user, body.action, body.resourceType, body.resourceId ?? null, body.payload, body.incidentId); }
  @Get('audit/verify') verify(@CurrentUser() user: AuthenticatedUser) { return this.service.verifyAudit(user); }
  @Post('sync') sync(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.sync(user, body); }
  @Post('models') model(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.registerModel(user, body); }
  @Post('models/:id/:action') modelAction(@Param('id', new ParseUUIDPipe()) id: string, @Param('action') action: string, @CurrentUser() user: AuthenticatedUser) { return this.service.modelAction(id, user, action.toUpperCase()); }
  @Post('incidents/:id/forecast') forecast(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.forecast(id, user, body); }
  @Post('incidents/:id/public-token') publicToken(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.createPublicToken(id, user, body); }
  @Post('recovery-runs') recovery(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.recoveryRun(user, body); }
  @Post('building-models') building(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.buildingModel(user, body); }
  @Post('incidents/:id/transcripts') transcript(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.transcript(id, user, body); }
  @Post('signatures') signature(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.signature(user, body); }
  @Post('retention-policies') retention(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.retention(user, body); }
  @Post('incidents/:id/evidence') evidence(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.evidence(id, user, body); }
  @Post('agencies') agency(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.agency(user, body); }
  @Post('incidents/:id/federation-shares') share(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.share(id, user, body); }
  @Post('preferences') preferences(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.service.preferences(user, body); }
}

@Controller('public/status')
export class PublicStatusController {
  constructor(private readonly service: GovernanceService) {}
  @Get(':token') status(@Param('token') token: string) { return this.service.publicStatus(token); }
}

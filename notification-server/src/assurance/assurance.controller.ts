import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssuranceService } from './assurance.service';

@Controller('assurance')
@UseGuards(JwtAuthGuard)
export class AssuranceController {
  constructor(private readonly service: AssuranceService) {}
  @Get() overview(@CurrentUser() user: AuthenticatedUser) { return this.service.overview(user); }
  @Post('retention/:policyId/preview') preview(@Param('policyId',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.previewRetention(id,user);}
  @Post('retention/executions/:id/approve') approve(@Param('id',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.approveRetention(id,user);}
  @Post('retention/executions/:id/execute') execute(@Param('id',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.executeRetention(id,user);}
  @Get('slo') slo(@CurrentUser() user:AuthenticatedUser){return this.service.sloDashboard(user);}
  @Post('slo/measurements') measure(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.recordSlo(user,body);}
  @Post('certificates') certificate(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.certificate(user,body);}
  @Post('ai-guardrails') guardrail(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.guardrail(user,body);}
  @Post('circuits/:provider/reset') reset(@Param('provider') provider:string,@CurrentUser() user:AuthenticatedUser){return this.service.resetCircuit(provider,user);}
  @Post('approvals') request(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.requestApproval(user,body);}
  @Post('approvals/:id/:decision') decide(@Param('id',new ParseUUIDPipe()) id:string,@Param('decision') decision:string,@CurrentUser() user:AuthenticatedUser){return this.service.decideApproval(id,user,decision.toUpperCase());}
  @Post('field-devices') device(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.fieldDevice(user,body);}
  @Post('field-devices/:id/:action') deviceAction(@Param('id',new ParseUUIDPipe()) id:string,@Param('action') action:string,@CurrentUser() user:AuthenticatedUser){return this.service.deviceAction(id,user,action.toUpperCase());}
  @Post('temporary-grants') grant(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.temporaryGrant(user,body);}
  @Post('temporary-grants/:id/revoke') revoke(@Param('id',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.revokeGrant(id,user);}
  @Post('offline-assets') asset(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.offlineAsset(user,body);}
  @Post('audit-exports') auditExport(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.auditExport(user,body);}
  @Post('signing-keys') signingKey(@CurrentUser() user:AuthenticatedUser,@Body() body:any){return this.service.signingKey(user,body);}
  @Post('signatures/:id/verify') verifySignature(@Param('id',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.service.verifySignature(id,user);}
}

import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';import { CurrentUser } from '../auth/current-user.decorator';import { JwtAuthGuard } from '../auth/jwt-auth.guard';import { FieldIntelligenceService } from './field-intelligence.service';

@Controller('field-intelligence') @UseGuards(JwtAuthGuard)
export class FieldIntelligenceController{constructor(private readonly service:FieldIntelligenceService){}
 @Post('offline-chunks') chunk(@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.uploadChunk(u,b)}
 @Post('building-models/:id/elements') bim(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.importBim(id,u,b)}
 @Post('transcripts/:id/analyze') transcript(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser){return this.service.analyzeTranscript(id,u)}
 @Post('handovers/:id/signatures') handover(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.attachHandoverSignature(id,u,b)}
 @Post('incidents/:id/observations') observation(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.observation(id,u,b)}
 @Post('incidents/:id/flights') flight(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.flight(id,u,b)}
 @Post('flights/:id/:decision') flightDecision(@Param('id',new ParseUUIDPipe())id:string,@Param('decision')d:string,@CurrentUser()u:AuthenticatedUser){return this.service.approveFlight(id,u,d.toUpperCase())}
 @Get('incidents/:id/decision-board') board(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser){return this.service.decisionBoard(id,u)}
 @Post('recommendations/:id/:status') decision(@Param('id',new ParseUUIDPipe())id:string,@Param('status')s:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.decision(id,u,s.toUpperCase(),b.reason)}
 @Post('security-anomalies') anomaly(@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.service.anomaly(u,b)}
 @Post('incidents/:id/kpi') kpi(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser){return this.service.kpi(id,u)}
}

@Controller('provider-webhooks')
export class ProviderWebhookController{constructor(private readonly service:FieldIntelligenceService){}@Post(':provider') webhook(@Param('provider')p:string,@Headers('x-event-id')id:string,@Headers('x-event-type')type:string,@Headers('x-dispatchmate-signature')sig:string|undefined,@Req()req:RawBodyRequest<Request>){return this.service.webhook(p,id,type,sig,req.rawBody??Buffer.from(JSON.stringify(req.body??{})))}}

import { Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';import type { AuthenticatedUser } from '../auth/authenticated-user.interface';import { JwtAuthGuard } from '../auth/jwt-auth.guard';import { IncidentAccessGuard } from '../alerts/incident-access.guard';import { MissionService } from './mission.service';
@Controller() @UseGuards(JwtAuthGuard)
export class MissionController{constructor(private readonly mission:MissionService){}
 @Get('incidents/:incidentId/mission-control') @UseGuards(IncidentAccessGuard) control(@Param('incidentId',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser){return this.mission.control(id,u)}
 @Post('incidents/:incidentId/commands') @UseGuards(IncidentAccessGuard) command(@Param('incidentId',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.createCommand(id,u,b)}
 @Patch('commands/:id/status') commandStatus(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.commandStatus(id,u,b.status)}
 @Patch('sop-items/:id/status') sop(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.sopStatus(id,u,b.status,b.note)}
 @Post('incidents/:incidentId/resource-requests') @UseGuards(IncidentAccessGuard) resource(@Param('incidentId',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.requestResource(id,u,b)}
 @Patch('resource-requests/:id/status') resourceStatus(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.resourceStatus(id,u,b.status)}
 @Get('operational-resources') inventory(@CurrentUser()u:AuthenticatedUser){return this.mission.inventory(u)}
 @Post('operational-resources') addInventory(@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.addInventory(u,b)}
 @Post('incidents/:incidentId/floors') @UseGuards(IncidentAccessGuard) floor(@Param('incidentId',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.createFloor(id,u,b)}
 @Post('incidents/:incidentId/markers') @UseGuards(IncidentAccessGuard) marker(@Param('incidentId',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.marker(id,u,b)}
 @Post('incidents/:incidentId/collaboration-packets') @UseGuards(IncidentAccessGuard) packet(@Param('incidentId',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.packet(id,u,b)}
 @Post('collaboration-packets/:id/share') share(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser){return this.mission.sharePacket(id,u)}
 @Get('ai-models') models(@CurrentUser()u:AuthenticatedUser){return this.mission.models(u)}
 @Post('ai-models') addModel(@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.addModel(u,b)}
 @Post('ai-thresholds') threshold(@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.threshold(u,b)}
 @Get('operations/readiness') readiness(@CurrentUser()u:AuthenticatedUser){return this.mission.readiness(u)}
 @Post('recovery-checkpoints') checkpoint(@CurrentUser()u:AuthenticatedUser,@Body()b:any){return this.mission.checkpoint(u,b)}
 @Patch('recovery-checkpoints/:id/verify') verify(@Param('id',new ParseUUIDPipe())id:string,@CurrentUser()u:AuthenticatedUser){return this.mission.verifyCheckpoint(id,u)}
}

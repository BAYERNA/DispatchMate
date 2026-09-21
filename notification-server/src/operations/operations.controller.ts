import { Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { IncidentAccessGuard } from '../alerts/incident-access.guard';
import { OperationsService } from './operations.service';
@Controller() @UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly operations:OperationsService){}
  @Get('incidents/:incidentId/timeline') @UseGuards(IncidentAccessGuard) timeline(@Param('incidentId',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.operations.timeline(id,user);}
  @Get('incidents/:incidentId/operations-map') @UseGuards(IncidentAccessGuard) map(@Param('incidentId',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser){return this.operations.map(id,user);}
  @Get('training-sessions') training(@CurrentUser() user:AuthenticatedUser){return this.operations.trainingList(user);}
  @Post('training-sessions') create(@CurrentUser() user:AuthenticatedUser,@Body() body:{title:string;scenario:string}){return this.operations.createTraining(user,body.title,body.scenario);}
  @Patch('training-sessions/:id/:action') action(@Param('id',new ParseUUIDPipe()) id:string,@Param('action') action:string,@CurrentUser() user:AuthenticatedUser,@Body() body:{note?:string}){return this.operations.trainingAction(id,user,action.toUpperCase(),body.note);}
  @Post('ai-judgments/:id/feedback') feedback(@Param('id',new ParseUUIDPipe()) id:string,@CurrentUser() user:AuthenticatedUser,@Body() body:{verdict:string;note?:string}){return this.operations.feedback(id,user,body.verdict,body.note);}
  @Get('ai-feedback/stats') stats(@CurrentUser() user:AuthenticatedUser){return this.operations.feedbackStats(user).then(rows=>rows[0]);}
}

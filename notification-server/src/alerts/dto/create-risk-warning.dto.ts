import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Channel } from '../entities/alert.entity';

// FR-06: 현장 위험정보 알림 (사람이 직접 보내는 경우). AI/시스템이 보내는 경우는 webhook 경로를 쓴다.
export class CreateRiskWarningDto {
  @IsOptional() @IsUUID() clientRequestId?: string;
  @IsOptional()
  @IsUUID()
  targetUserId?: string; // 비우면 전체 대원 브로드캐스트

  @IsIn(['VOICE', 'TEXT'])
  channel: Channel;

  @IsString()
  @MaxLength(2000)
  message: string;
}

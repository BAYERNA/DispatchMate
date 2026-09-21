import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsOptional, IsPositive, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

class RequestedItemDto {
  @IsString()
  @MaxLength(50)
  item: string;

  @IsInt()
  @IsPositive()
  qty: number;
}

// FR-23: 장비·인력 지원 요청. 예: [{item:"공기호흡기", qty:2}, {item:"인력", qty:2}]
export class CreateSupplyRequestDto {
  @IsOptional() @IsUUID() clientRequestId?: string;
  @ValidateNested({ each: true })
  @Type(() => RequestedItemDto)
  @ArrayMinSize(1)
  requestedItems: RequestedItemDto[];
}

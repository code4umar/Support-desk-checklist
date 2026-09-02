import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketStatus } from '../../common/enums';

export class ChangeStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;

  // Required only when reopening a closed ticket (rule 4) — that check
  // happens in the service, since it depends on the ticket's CURRENT
  // status, not on the shape of the request alone.
  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}

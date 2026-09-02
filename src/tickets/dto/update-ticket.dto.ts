import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TicketPriority } from '../../common/enums';

// Deliberately does NOT include `status` or `assigneeId` — those move
// through /status and /assign so each can carry its own rule (the status
// machine, the 422 on a bad assignee). Mixing them into a generic PATCH
// would make those rules easy to bypass.
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

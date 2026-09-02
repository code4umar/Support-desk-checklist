import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { TicketPriority } from '../../common/enums';

// No `due_at`/`dueAt` field on purpose — it's computed server-side from
// priority (rule 8). A client that sends one is rejected 400 by the same
// global whitelist that catches any other undeclared property.
export class CreateTicketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject: string;

  @IsString()
  @MinLength(1)
  body: string;

  @IsEnum(TicketPriority)
  priority: TicketPriority;
}

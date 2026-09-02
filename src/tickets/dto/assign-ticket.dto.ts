import { IsInt } from 'class-validator';

export class AssignTicketDto {
  @IsInt()
  assigneeId: number;
}

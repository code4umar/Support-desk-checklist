import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class LinkTicketDto {
  @IsInt()
  @Min(1)
  knownIssueId: number;
}

export class SimilarTicketsQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  q: string;
}

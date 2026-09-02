import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  body: string;

  // Only an agent/admin may set this true — enforced in the service,
  // since it depends on who's calling, not on the shape of the body.
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

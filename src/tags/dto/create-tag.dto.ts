import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}

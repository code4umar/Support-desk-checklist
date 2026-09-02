import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

// No `role` property here on purpose. The global ValidationPipe has
// forbidNonWhitelisted:true, so a client that sends `role` in the body
// gets a 400 automatically — registration can never create anything but
// a customer (rule 1).
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates beyond 72 bytes
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  full_name: string;
}

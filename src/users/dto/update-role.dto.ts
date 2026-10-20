import { IsEnum } from 'class-validator';
import { UserRole } from '../../common/enums';

export class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

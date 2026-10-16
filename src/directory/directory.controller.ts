import { Controller, Get, UseGuards } from '@nestjs/common';
import { DirectoryService } from './directory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirectoryController {
  constructor(private directory: DirectoryService) {}

  // GET /staff  -> [{ id, full_name, role }]   (agents and admins only)
  @Get()
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  list() {
    return this.directory.listStaff();
  }
}

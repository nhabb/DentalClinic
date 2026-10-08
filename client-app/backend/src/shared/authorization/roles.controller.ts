import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RequirePermissions } from './permissions.decorator';
import { PERMISSION_GROUPS } from './permissions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { UserAccessService } from '../tenant/user-access.service';

/**
 * Roles and permissions of the caller's clinic. Reading needs `staff:read`
 * (the staff page shows roles), changing anything needs `roles:manage`.
 */
@ApiBearerAuth()
@ApiTags('Roles & permissions')
@Controller()
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly userAccess: UserAccessService,
  ) {}

  @Get('permissions')
  @RequirePermissions('staff:read')
  @ApiOperation({ summary: 'The permission catalog, grouped for display' })
  catalog() {
    return PERMISSION_GROUPS;
  }

  @Get('roles')
  @RequirePermissions('staff:read')
  @ApiOperation({
    summary: 'Roles of the clinic with their permissions and user counts',
  })
  list() {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Create a custom role' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch('roles/:key')
  @RequirePermissions('roles:manage')
  @ApiOperation({
    summary: 'Rename a role or replace its permissions (admin stays locked)',
  })
  async update(@Param('key') key: string, @Body() dto: UpdateRoleDto) {
    const role = await this.roles.update(key, dto);
    // Holders of this role get the new permissions on their next request.
    this.userAccess.invalidate();
    return role;
  }

  @Delete('roles/:key')
  @RequirePermissions('roles:manage')
  @ApiOperation({ summary: 'Delete a custom role nobody holds' })
  remove(@Param('key') key: string) {
    return this.roles.remove(key);
  }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlatformUser } from '../auth/auth.service';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

/** Roles and permissions of any clinic, managed by the platform. */
@ApiBearerAuth()
@ApiTags('Roles')
@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'The permission catalog (same as the clinic API)' })
  catalog() {
    return this.roles.catalog();
  }

  @Get('organizations/:id/roles')
  @ApiOperation({ summary: 'Roles of a clinic with their permissions and user counts' })
  list(@Param('id', ParseIntPipe) id: number) {
    return this.roles.list(BigInt(id));
  }

  @Post('organizations/:id/roles')
  @ApiOperation({ summary: 'Add a custom role to a clinic' })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRoleDto,
    @Req() req: { user: PlatformUser },
  ) {
    return this.roles.create(BigInt(id), dto, req.user.id);
  }

  @Patch('organizations/:id/roles/:key')
  @ApiOperation({ summary: 'Rename a role or change its permissions (admin is locked)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('key') key: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: { user: PlatformUser },
  ) {
    return this.roles.update(BigInt(id), key, dto, req.user.id);
  }

  @Delete('organizations/:id/roles/:key')
  @ApiOperation({ summary: 'Delete an unused custom role' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('key') key: string,
    @Req() req: { user: PlatformUser },
  ) {
    return this.roles.remove(BigInt(id), key, req.user.id);
  }
}

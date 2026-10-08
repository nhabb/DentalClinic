import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../authorization/permissions.decorator';
import { RolesService } from '../authorization/roles.service';
import { RequestUser } from '../common/guards/jwt-auth.guard';
import { AccessControlService } from '../access/access-control.service';
import { UsersService } from './users.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { StaffAssignmentDto } from './dto/staff-assignment.dto';

type AuthedRequest = { user: RequestUser };

/**
 * User accounts. Managing accounts needs `staff:manage`, listing them
 * `staff:read`; a user may always read and edit their own profile. Two
 * lookups stay public because the admin UI needs them before it has a token.
 */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly roles: RolesService,
    private readonly access: AccessControlService,
  ) {}

  @Post('register')
  @RequirePermissions('patients:write')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a patient account from the admin panel (legacy; prefer POST /patients)',
  })
  register(
    @Body()
    body: {
      email: string;
      first_name: string;
      last_name: string;
      phone?: string;
    },
  ) {
    return this.usersService.create({ ...body, role: 'patient' });
  }

  @Public()
  @Get('by-email')
  @ApiOperation({
    summary:
      'Look up a user id and role by email (public, used by the admin login page)',
  })
  @ApiQuery({ name: 'email', required: true })
  findByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Public()
  @Get('doctors')
  @ApiOperation({
    summary:
      "List the clinic's staff who take appointments (public, for booking)",
  })
  findDoctors() {
    return this.usersService.findStaff();
  }

  @Post('staff')
  @RequirePermissions('staff:manage')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a staff member with one of the clinic’s roles; branch_id sets their home branch',
  })
  async createStaff(
    @Body()
    body: {
      email: string;
      first_name: string;
      last_name: string;
      phone?: string;
      role: string;
      branch_id?: number;
      restrict_to_branch?: boolean;
    },
  ) {
    if (!(await this.roles.isAssignableStaffRole(body.role))) {
      throw new BadRequestException(
        `"${body.role}" is not a staff role of this clinic (see GET /roles)`,
      );
    }
    return this.usersService.create(body);
  }

  @Patch(':id/assignment')
  @RequirePermissions('staff:manage')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Change a staff member’s role, home branch, branch restriction or active flag',
  })
  updateAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StaffAssignmentDto,
  ) {
    return this.usersService.updateAssignment(BigInt(id), dto);
  }

  @Delete(':id')
  @RequirePermissions('staff:manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(BigInt(id));
  }

  @Get()
  @RequirePermissions('staff:read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List users of the organization (optionally filtered by role)',
  })
  @ApiQuery({ name: 'role', required: false, type: String })
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by ID (others need staff:read)' })
  findOne(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    this.access.assertSelfOrPermission(req.user, id, 'staff:read');
    return this.usersService.findById(BigInt(id));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update profile fields (others need staff:manage)',
  })
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    this.access.assertSelfOrPermission(req.user, id, 'staff:manage');
    return this.usersService.update(BigInt(id), dto);
  }

  @Patch(':id/avatar')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload or replace an avatar photo (others need staff:manage)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  updateAvatar(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.access.assertSelfOrPermission(req.user, id, 'staff:manage');
    return this.usersService.updateAvatar(BigInt(id), file);
  }

  @Patch(':id/password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change your own password (requires the old password)',
  })
  changePassword(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangePasswordDto,
  ) {
    this.access.assertSelf(req.user, id);
    return this.usersService.changePassword(BigInt(id), dto);
  }
}

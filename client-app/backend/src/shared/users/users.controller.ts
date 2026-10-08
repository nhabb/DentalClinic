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
import {
  ORG_ADMIN_ROLES,
  Roles,
  STAFF_ROLES,
} from '../common/decorators/roles.decorator';
import { RequestUser } from '../common/guards/jwt-auth.guard';
import { AccessControlService } from '../access/access-control.service';
import { UsersService } from './users.service';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { StaffAssignmentDto } from './dto/staff-assignment.dto';

type AuthedRequest = { user: RequestUser };

/**
 * User accounts. Account management is for organization admins, profile edits
 * are for the user themselves or staff, and two lookups stay public because the
 * admin UI needs them before it has a token.
 */
@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly access: AccessControlService,
  ) {}

  @Post('register')
  @Roles(...STAFF_ROLES)
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
  @Roles(...ORG_ADMIN_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a staff member (doctor, secretary, admin); branch_id sets their home branch',
  })
  createStaff(
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
    if (!STAFF_ROLES.includes(body.role)) {
      throw new BadRequestException(
        `role must be one of: ${STAFF_ROLES.join(', ')}`,
      );
    }
    return this.usersService.create(body);
  }

  @Patch(':id/assignment')
  @Roles(...ORG_ADMIN_ROLES)
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
  @Roles(...ORG_ADMIN_ROLES)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(BigInt(id));
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List users of the organization (optionally filtered by role)',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['patient', 'doctor', 'secretary', 'admin'],
  })
  findAll(@Query('role') role?: string) {
    return this.usersService.findAll(role);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a user by ID (patients: only themselves)' })
  findOne(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    this.access.assertSelfOrStaff(req.user, id);
    return this.usersService.findById(BigInt(id));
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update profile fields (patients: only themselves)',
  })
  update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    this.access.assertSelfOrStaff(req.user, id);
    return this.usersService.update(BigInt(id), dto);
  }

  @Patch(':id/avatar')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload or replace an avatar photo (patients: only themselves)',
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
    this.access.assertSelfOrStaff(req.user, id);
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

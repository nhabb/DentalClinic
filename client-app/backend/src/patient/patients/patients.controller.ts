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
  DefaultValuePipe,
  UploadedFile,
  UseInterceptors,
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
import {
  ORG_ADMIN_ROLES,
  Roles,
  STAFF_ROLES,
} from '../../shared/common/decorators/roles.decorator';
import { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { AccessControlService } from '../../shared/access/access-control.service';
import { PatientsService } from './patients.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { SetPatientStatusDto } from './dto/set-patient-status.dto';
import { CreatePatientDto } from './dto/create-patient.dto';

type AuthedRequest = { user: RequestUser };

/**
 * Patient profiles. Staff manage every patient of their organization; a
 * patient can read and edit their own profile only.
 */
@ApiBearerAuth()
@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly access: AccessControlService,
  ) {}

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Create a patient (user account + profile) from the admin panel',
    description:
      'Email is optional but email or phone is required. When an email is given, a password setup link is emailed and returned as `invite`.',
  })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Post(':id/invite')
  @Roles(...STAFF_ROLES)
  @ApiOperation({
    summary: 'Send (or resend) the password setup link to a patient by email',
  })
  sendInvite(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.sendInvite(BigInt(id));
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List all patient profiles of the organization' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.patientsService.findAll(page, limit, search);
  }

  @Get('by-user/:userId')
  @ApiOperation({
    summary: 'Patient profile by user ID (patients: only their own)',
  })
  findByUserId(
    @Req() req: AuthedRequest,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    this.access.assertSelfOrStaff(req.user, userId);
    return this.patientsService.findByUserId(BigInt(userId));
  }

  @Patch('by-user/:userId')
  @ApiOperation({
    summary: 'Update patient profile by user ID (patients: only their own)',
  })
  updateByUserId(
    @Req() req: AuthedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    this.access.assertSelfOrStaff(req.user, userId);
    return this.patientsService.updateByUserId(BigInt(userId), dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Patient profile by profile ID (patients: only their own)',
  })
  async findOne(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.access.assertPatientProfileAccess(req.user, id);
    return this.patientsService.findById(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update patient profile (patients: only their own)',
  })
  async update(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    await this.access.assertPatientProfileAccess(req.user, id);
    return this.patientsService.update(BigInt(id), dto);
  }

  @Patch(':id/photo')
  @ApiOperation({
    summary:
      'Upload or replace a patient profile photo (patients: only their own)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async updatePhoto(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.access.assertPatientProfileAccess(req.user, id);
    return this.patientsService.updatePhoto(BigInt(id), file);
  }

  @Patch(':id/status')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Set patient active/inactive status' })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetPatientStatusDto,
  ) {
    return this.patientsService.setStatus(BigInt(id), dto.is_active);
  }

  @Delete(':id')
  @Roles(...ORG_ADMIN_ROLES)
  @ApiOperation({
    summary: 'Delete a patient (removes user account and all associated data)',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientsService.remove(BigInt(id));
  }
}

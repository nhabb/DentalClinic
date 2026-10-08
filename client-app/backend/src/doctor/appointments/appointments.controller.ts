import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import {
  Roles,
  STAFF_ROLES,
} from '../../shared/common/decorators/roles.decorator';
import { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { AccessControlService } from '../../shared/access/access-control.service';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  CancelAppointmentDto,
  UpdateAppointmentNotesDto,
} from './dto/update-appointment.dto';

type AuthedRequest = { user: RequestUser };

/**
 * Appointments. Staff manage every appointment of their organization; patients
 * may only book for themselves, read and cancel their own.
 */
@ApiBearerAuth()
@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly access: AccessControlService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Book an available slot (patients: only for their own profile)',
  })
  async create(@Req() req: AuthedRequest, @Body() dto: CreateAppointmentDto) {
    await this.access.assertPatientProfileAccess(req.user, dto.patient_id);
    return this.appointmentsService.create(dto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List appointments with filters' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({
    name: 'branch_id',
    required: false,
    type: Number,
    description: 'Only appointments at this branch',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('doctor_id') doctor_id?: string,
    @Query('patient_id') patient_id?: string,
    @Query('branch_id') branch_id?: string,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.appointmentsService.findAll({
      doctor_id: doctor_id ? Number(doctor_id) : undefined,
      patient_id: patient_id ? Number(patient_id) : undefined,
      branch_id: branch_id ? Number(branch_id) : undefined,
      status,
      date,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single appointment (patients: only their own)',
  })
  async findOne(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.ownAppointment(req.user, id);
  }

  @Patch(':id/confirm')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Confirm a pending appointment' })
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.confirm(BigInt(id));
  }

  @Patch(':id/complete')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Mark an appointment as completed' })
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.complete(BigInt(id));
  }

  @Patch(':id/no-show')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Mark an appointment as no-show (patient missed)' })
  noShow(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.noShow(BigInt(id));
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel an appointment and free the slot (patients: only their own)',
  })
  async cancel(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelAppointmentDto,
  ) {
    await this.ownAppointment(req.user, id);
    return this.appointmentsService.cancel(BigInt(id), dto);
  }

  @Patch(':id/notes')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Update appointment notes' })
  updateNotes(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentNotesDto,
  ) {
    return this.appointmentsService.updateNotes(BigInt(id), dto);
  }

  /** The appointment, after checking a patient only reaches their own. */
  private async ownAppointment(user: RequestUser, id: number) {
    const appointment = await this.appointmentsService.findOne(BigInt(id));
    await this.access.assertPatientProfileAccess(user, appointment.patient_id);
    return appointment;
  }
}

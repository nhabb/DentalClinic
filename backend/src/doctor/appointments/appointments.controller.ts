import {
  UseGuards,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  CancelAppointmentDto,
  UpdateAppointmentNotesDto,
} from './dto/update-appointment.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Patient books an available slot (status: scheduled)',
  })
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List appointments with filters' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
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
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.appointmentsService.findAll({
      doctor_id: doctor_id ? Number(doctor_id) : undefined,
      patient_id: patient_id ? Number(patient_id) : undefined,
      status,
      date,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single appointment' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.findOne(BigInt(id));
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Doctor confirms a pending appointment' })
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.confirm(BigInt(id));
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Doctor marks appointment as completed' })
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.complete(BigInt(id));
  }

  @Patch(':id/no-show')
  @ApiOperation({
    summary: 'Doctor marks appointment as no-show (patient missed)',
  })
  noShow(@Param('id', ParseIntPipe) id: number) {
    return this.appointmentsService.noShow(BigInt(id));
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Doctor or patient cancels an appointment (frees the slot)',
  })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancel(BigInt(id), dto);
  }

  @Patch(':id/notes')
  @ApiOperation({ summary: 'Doctor updates appointment notes' })
  updateNotes(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentNotesDto,
  ) {
    return this.appointmentsService.updateNotes(BigInt(id), dto);
  }
}

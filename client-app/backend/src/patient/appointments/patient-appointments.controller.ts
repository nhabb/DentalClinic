import {
  Controller,
  Get,
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
import { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { AccessControlService } from '../../shared/access/access-control.service';
import { PatientAppointmentsService } from './patient-appointments.service';
import { CancelAppointmentDto } from '../../doctor/appointments/dto/update-appointment.dto';

/** A patient's own appointments. `user_id` must be the caller unless the caller is staff. */
@ApiBearerAuth()
@ApiTags('Patient — Appointments')
@Controller('patient/appointments')
export class PatientAppointmentsController {
  constructor(
    private readonly service: PatientAppointmentsService,
    private readonly access: AccessControlService,
  ) {}

  @Get('upcoming')
  @ApiOperation({
    summary:
      'Upcoming appointments for a patient (pending / scheduled / confirmed)',
  })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUpcoming(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.access.assertSelfOrStaff(req.user, userId);
    return this.service.getUpcoming(userId, page, limit);
  }

  @Get('history')
  @ApiOperation({
    summary:
      'Past appointments for a patient (completed / cancelled / no_show)',
  })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getHistory(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.access.assertSelfOrStaff(req.user, userId);
    return this.service.getHistory(userId, page, limit);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Patient cancels their own appointment' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  cancel(
    @Req() req: { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
    @Query('user_id', ParseIntPipe) userId: number,
    @Body() dto: CancelAppointmentDto,
  ) {
    this.access.assertSelfOrStaff(req.user, userId);
    return this.service.cancel(userId, id, dto);
  }
}

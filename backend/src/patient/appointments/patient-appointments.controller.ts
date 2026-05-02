import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { PatientAppointmentsService } from './patient-appointments.service';
import { CancelAppointmentDto } from '../../doctor/appointments/dto/update-appointment.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient — Appointments')
@Controller('patient/appointments')
export class PatientAppointmentsController {
  constructor(private readonly service: PatientAppointmentsService) {}

  @Get('upcoming')
  @ApiOperation({
    summary:
      'Get upcoming appointments for a patient (pending / scheduled / confirmed)',
  })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUpcoming(
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getUpcoming(userId, page, limit);
  }

  @Get('history')
  @ApiOperation({
    summary:
      'Get past appointments for a patient (completed / cancelled / no_show)',
  })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getHistory(
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getHistory(userId, page, limit);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Patient cancels their own appointment' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Query('user_id', ParseIntPipe) userId: number,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.service.cancel(userId, id, dto);
  }
}

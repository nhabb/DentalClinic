import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { AppointmentSlotsService } from '../../doctor/appointment-slots/appointment-slots.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient — Available Slots')
@Controller('patient/available-slots')
export class AvailableSlotsController {
  constructor(private readonly slotsService: AppointmentSlotsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse available (unbooked) appointment slots' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAvailable(
    @Query('doctor_id') doctorId?: string,
    @Query('date') date?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.slotsService.findAll({
      doctor_id: doctorId ? Number(doctorId) : undefined,
      date,
      available_only: true,
      page,
      limit,
    });
  }
}

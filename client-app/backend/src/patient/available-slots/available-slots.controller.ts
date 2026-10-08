import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentSlotsService } from '../../doctor/appointment-slots/appointment-slots.service';

/** Unbooked slots of the caller's clinic; any signed-in user may browse them. */
@ApiBearerAuth()
@ApiTags('Patient — Available Slots')
@Controller('patient/available-slots')
export class AvailableSlotsController {
  constructor(private readonly slotsService: AppointmentSlotsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse available (unbooked) appointment slots' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({
    name: 'branch_id',
    required: false,
    type: Number,
    description: 'Only slots at this clinic location',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAvailable(
    @Query('doctor_id') doctorId?: string,
    @Query('branch_id') branchId?: string,
    @Query('date') date?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.slotsService.findAll({
      doctor_id: doctorId ? Number(doctorId) : undefined,
      branch_id: branchId ? Number(branchId) : undefined,
      date,
      available_only: true,
      page,
      limit,
    });
  }
}

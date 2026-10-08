import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
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
import {
  Roles,
  STAFF_ROLES,
} from '../../shared/common/decorators/roles.decorator';
import { AppointmentSlotsService } from './appointment-slots.service';
import { CreateSlotDto } from './dto/create-slot.dto';

/**
 * Staff management of a doctor's bookable time slots. Patients browse slots
 * through /patient/available-slots instead.
 */
@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@ApiTags('Appointment Slots')
@Controller('appointment-slots')
export class AppointmentSlotsController {
  constructor(private readonly slotsService: AppointmentSlotsService) {}

  @Post('bulk')
  @ApiOperation({ summary: 'Create multiple slots from a time range' })
  createBulk(
    @Body()
    dto: {
      doctor_id: number;
      slot_date: string;
      from_time: string;
      to_time: string;
      duration_minutes: number;
      branch_id?: number;
    },
  ) {
    return this.slotsService.createBulk(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single available slot' })
  create(@Body() dto: CreateSlotDto) {
    return this.slotsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List slots with optional filters' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({
    name: 'branch_id',
    required: false,
    type: Number,
    description: 'Only slots at this branch',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'from_date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD range start (inclusive)',
  })
  @ApiQuery({
    name: 'to_date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD range end (inclusive)',
  })
  @ApiQuery({ name: 'available_only', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('doctor_id') doctor_id?: string,
    @Query('branch_id') branch_id?: string,
    @Query('date') date?: string,
    @Query('from_date') from_date?: string,
    @Query('to_date') to_date?: string,
    @Query('available_only') available_only?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.slotsService.findAll({
      doctor_id: doctor_id ? Number(doctor_id) : undefined,
      branch_id: branch_id ? Number(branch_id) : undefined,
      date,
      from_date,
      to_date,
      available_only: available_only === 'true',
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single slot by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.slotsService.findOne(BigInt(id));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an unbooked slot' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.slotsService.remove(BigInt(id));
  }
}

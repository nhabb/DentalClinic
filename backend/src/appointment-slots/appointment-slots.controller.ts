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
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AppointmentSlotsService } from './appointment-slots.service';
import { CreateSlotDto } from './dto/create-slot.dto';

@ApiTags('Appointment Slots')
@Controller('appointment-slots')
export class AppointmentSlotsController {
  constructor(private readonly slotsService: AppointmentSlotsService) {}

  @Post()
  @ApiOperation({ summary: 'Doctor creates an available slot' })
  create(@Body() dto: CreateSlotDto) {
    return this.slotsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List slots with optional filters' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'available_only', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('doctor_id') doctor_id?: string,
    @Query('date') date?: string,
    @Query('available_only') available_only?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.slotsService.findAll({
      doctor_id: doctor_id ? Number(doctor_id) : undefined,
      date,
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
  @ApiOperation({ summary: 'Doctor deletes an unbooked slot' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.slotsService.remove(BigInt(id));
  }
}

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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatientRecordsService } from './patient-records.service';
import { CreatePatientRecordDto } from './dto/create-record.dto';
import { UpdatePatientRecordDto } from './dto/update-record.dto';

@ApiTags('Patient Records')
@Controller('patient-records')
export class PatientRecordsController {
  constructor(private readonly patientRecordsService: PatientRecordsService) {}

  @Post()
  @ApiOperation({ summary: 'Doctor creates a clinical record for a patient' })
  create(@Body() dto: CreatePatientRecordDto) {
    return this.patientRecordsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List patient records with filters' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'record_type', required: false, enum: ['general_note', 'diagnosis', 'treatment', 'prescription', 'xray', 'lab_result', 'follow_up'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id') patient_id?: string,
    @Query('record_type') record_type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.patientRecordsService.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      record_type,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single patient record' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientRecordsService.findOne(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Doctor updates a patient record' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientRecordDto,
  ) {
    return this.patientRecordsService.update(BigInt(id), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Doctor deletes a patient record' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientRecordsService.remove(BigInt(id));
  }
}

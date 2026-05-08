import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { PatientRecordsService } from '../../doctor/patient-records/patient-records.service';
import { PatientsService } from '../patients/patients.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient — Records')
@Controller('patient/patient-records')
export class PatientRecordsViewController {
  constructor(
    private readonly patientRecordsService: PatientRecordsService,
    private readonly patientsService: PatientsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get all clinical records for a patient (read-only)',
  })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'record_type', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('record_type') recordType?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    return this.patientRecordsService.findAll({
      patient_id: Number(profile.id),
      record_type: recordType,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single clinical record (must belong to the patient)',
  })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query('user_id', ParseIntPipe) userId: number,
  ) {
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    const record = await this.patientRecordsService.findOne(BigInt(id));

    if (record.patient_profiles.id.toString() !== profile.id.toString()) {
      throw new ForbiddenException('This record does not belong to you');
    }

    return record;
  }
}

import {
  Controller,
  Get,
  Param,
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
import { PatientRecordsService } from '../../doctor/patient-records/patient-records.service';
import { PatientsService } from '../patients/patients.service';

/** Read-only view of a patient's clinical records. `user_id` must be the caller unless staff. */
@ApiBearerAuth()
@ApiTags('Patient — Records')
@Controller('patient/patient-records')
export class PatientRecordsViewController {
  constructor(
    private readonly patientRecordsService: PatientRecordsService,
    private readonly patientsService: PatientsService,
    private readonly access: AccessControlService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All clinical records of a patient' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({ name: 'record_type', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('record_type') recordType?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    this.access.assertSelfOrPermission(req.user, userId, 'records:read');
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    return this.patientRecordsService.findAll({
      patient_id: Number(profile.id),
      record_type: recordType,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One clinical record (must belong to the patient)' })
  async findOne(
    @Req() req: { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const record = await this.patientRecordsService.findOne(BigInt(id));
    await this.access.assertPatientProfileAccess(
      req.user,
      record.patient_id,
      'records:read',
    );
    return record;
  }
}

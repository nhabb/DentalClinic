import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, STAFF_ROLES } from '../../shared/common/decorators/roles.decorator';
import { PatientWorkService } from './patient-work.service';
import { RecordWorkDto } from './dto/record-work.dto';
import { CompleteWorkDto } from './dto/complete-work.dto';

@ApiBearerAuth()
@Roles(...STAFF_ROLES)
@ApiTags('Patient Work (dental chart)')
@Controller('patient-work')
export class PatientWorkController {
  constructor(private readonly patientWorkService: PatientWorkService) {}

  @Get('chart/:patientId')
  @ApiOperation({ summary: 'Per-tooth status summary and work history for the dental chart' })
  getChart(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.patientWorkService.getChart(BigInt(patientId));
  }

  @Post()
  @ApiOperation({
    summary: 'Record work on one or more teeth',
    description:
      'Creates one treatment record per tooth × procedure. Completed items with a price are billed on a single new invoice.',
  })
  recordWork(@Body() dto: RecordWorkDto) {
    return this.patientWorkService.recordWork(dto);
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Mark planned work as completed and/or bill unbilled work',
    description:
      'Accepts planned records and completed records without an invoice. Items with a price are billed together on one new invoice; the records are linked to it.',
  })
  completePlanned(@Body() dto: CompleteWorkDto) {
    return this.patientWorkService.completePlanned(dto);
  }

  @Delete('records/:id')
  @ApiOperation({ summary: 'Remove a planned or missing-tooth record (not billed work)' })
  removeRecord(@Param('id', ParseIntPipe) id: number) {
    return this.patientWorkService.removeRecord(BigInt(id));
  }
}

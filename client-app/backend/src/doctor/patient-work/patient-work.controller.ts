import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { PatientWorkService } from './patient-work.service';
import { RecordWorkDto } from './dto/record-work.dto';
import { CompleteWorkDto, RepriceWorkDto } from './dto/complete-work.dto';

@ApiBearerAuth()
@RequirePermissions('records:read')
@ApiTags('Patient Work (dental chart)')
@Controller('patient-work')
export class PatientWorkController {
  constructor(private readonly patientWorkService: PatientWorkService) {}

  @Get('chart/:patientId')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Per-tooth status summary and work history for the dental chart',
  })
  getChart(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.patientWorkService.getChart(BigInt(patientId));
  }

  @Post()
  @RequirePermissions('records:create')
  @ApiOperation({
    summary: 'Record work on one or more teeth (clinical only, never billed)',
    description:
      'Creates one record per tooth × procedure. A price is noted on the record (quoted_amount); invoices are created only on the billing page (POST /billing/invoices).',
  })
  recordWork(@Body() dto: RecordWorkDto, @Req() req: { user: RequestUser }) {
    return this.patientWorkService.recordWork(dto, BigInt(req.user.id));
  }

  @Post('complete')
  @RequirePermissions('records:edit')
  @ApiOperation({
    summary: 'Mark planned work as completed (clinical only, never billed)',
    description:
      'Accepts planned records and completed records without an invoice. A price is noted on the record (quoted_amount); invoices are created only on the billing page.',
  })
  completePlanned(@Body() dto: CompleteWorkDto) {
    return this.patientWorkService.completePlanned(dto);
  }

  @Patch('records/:id/price')
  @RequirePermissions('records:edit')
  @ApiOperation({
    summary: "Reprice one planned item; the patient's quote follows",
    description:
      'Planned, unbilled work only. The quote that follows the plan is rebuilt from it, so the estimate the patient is given always matches the chart.',
  })
  repriceRecord(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RepriceWorkDto,
    @Req() req: { user: RequestUser },
  ) {
    return this.patientWorkService.repriceRecord(
      BigInt(id),
      dto.amount,
      BigInt(req.user.id),
    );
  }

  @Delete('records/:id')
  @RequirePermissions('records:delete')
  @ApiOperation({
    summary: 'Remove a planned or missing-tooth record (not billed work)',
  })
  removeRecord(@Param('id', ParseIntPipe) id: number) {
    return this.patientWorkService.removeRecord(BigInt(id));
  }
}

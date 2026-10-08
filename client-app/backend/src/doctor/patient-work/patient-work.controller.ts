import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { AccessControlService } from '../../shared/access/access-control.service';
import { PatientWorkService } from './patient-work.service';
import { RecordWorkDto } from './dto/record-work.dto';
import { CompleteWorkDto } from './dto/complete-work.dto';

/** Billing from the chart is billing, whatever screen it happens on. */
export const CHART_BILLING_PERMISSION = 'billing:write';

/**
 * Recording work needs records:write; billing that work on an invoice also
 * needs billing:write, exactly like POST /billing/invoices. A caller without
 * it can still record the work unbilled by sending create_invoice: false.
 */
export function assertMayBill(
  access: Pick<AccessControlService, 'hasPermission'>,
  actor: RequestUser,
  dto: { create_invoice?: boolean },
): void {
  if (dto.create_invoice === false) return;
  if (access.hasPermission(actor, CHART_BILLING_PERMISSION)) return;
  throw new ForbiddenException(
    `Billing this work needs the permission ${CHART_BILLING_PERMISSION}; send create_invoice: false to record it without an invoice`,
  );
}

@ApiBearerAuth()
@RequirePermissions('records:write')
@ApiTags('Patient Work (dental chart)')
@Controller('patient-work')
export class PatientWorkController {
  constructor(
    private readonly patientWorkService: PatientWorkService,
    private readonly access: AccessControlService,
  ) {}

  @Get('chart/:patientId')
  @RequirePermissions('records:read')
  @ApiOperation({
    summary: 'Per-tooth status summary and work history for the dental chart',
  })
  getChart(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.patientWorkService.getChart(BigInt(patientId));
  }

  @Post()
  @ApiOperation({
    summary: 'Record work on one or more teeth',
    description:
      'Creates one treatment record per tooth × procedure. Completed items with a price are billed on a single new invoice, which needs billing:write (send create_invoice: false to record unbilled work).',
  })
  recordWork(@Body() dto: RecordWorkDto, @Req() req: { user: RequestUser }) {
    assertMayBill(this.access, req.user, dto);
    return this.patientWorkService.recordWork(dto);
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Mark planned work as completed and/or bill unbilled work',
    description:
      'Accepts planned records and completed records without an invoice. Items with a price are billed together on one new invoice, which needs billing:write (send create_invoice: false to complete without billing).',
  })
  completePlanned(
    @Body() dto: CompleteWorkDto,
    @Req() req: { user: RequestUser },
  ) {
    assertMayBill(this.access, req.user, dto);
    return this.patientWorkService.completePlanned(dto);
  }

  @Delete('records/:id')
  @ApiOperation({
    summary: 'Remove a planned or missing-tooth record (not billed work)',
  })
  removeRecord(@Param('id', ParseIntPipe) id: number) {
    return this.patientWorkService.removeRecord(BigInt(id));
  }
}

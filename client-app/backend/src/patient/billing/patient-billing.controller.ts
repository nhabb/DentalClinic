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
import { BillingService } from '../../doctor/billing/billing.service';
import { PatientsService } from '../patients/patients.service';

/** A patient's own invoices. `user_id` must be the caller unless the caller is staff. */
@ApiBearerAuth()
@ApiTags('Patient — Billing')
@Controller('patient/billing')
export class PatientBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly patientsService: PatientsService,
    private readonly access: AccessControlService,
  ) {}

  @Get('invoices')
  @ApiOperation({ summary: 'All treatment invoices of a patient' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['open', 'partial', 'paid'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Req() req: { user: RequestUser },
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    this.access.assertSelfOrPermission(req.user, userId, 'billing:read');
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    return this.billingService.findAll({
      patient_id: Number(profile.id),
      status,
      page,
      limit,
    });
  }

  @Get('invoices/:id')
  @ApiOperation({
    summary: 'One treatment invoice (must belong to the patient)',
  })
  async findOne(
    @Req() req: { user: RequestUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const invoice = await this.billingService.findOne(BigInt(id));
    await this.access.assertPatientProfileAccess(
      req.user,
      invoice.patient_id,
      'billing:read',
    );
    return invoice;
  }
}

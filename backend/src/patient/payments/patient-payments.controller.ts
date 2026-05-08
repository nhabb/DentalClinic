import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { BillingService } from '../../doctor/billing/billing.service';
import { PatientsService } from '../patients/patients.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient — Billing')
@Controller('patient/payments')
export class PatientPaymentsController {
  constructor(
    private readonly billingService: BillingService,
    private readonly patientsService: PatientsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all treatment invoices for a patient' })
  @ApiQuery({ name: 'user_id', required: true, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['open', 'partial', 'paid'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('user_id', ParseIntPipe) userId: number,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const profile = await this.patientsService.findByUserId(BigInt(userId));
    return this.billingService.findAll({
      patient_id: Number(profile.id),
      status,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single treatment invoice by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.billingService.findOne(BigInt(id));
  }
}

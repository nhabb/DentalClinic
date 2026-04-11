import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payment record for a patient' })
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Financial summary: total income, expenses, and net profit' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.paymentsService.getSummary({ from, to });
  }

  @Get('outstanding')
  @ApiOperation({ summary: 'All unpaid and partially paid invoices with remaining balance' })
  getOutstanding() {
    return this.paymentsService.getOutstanding();
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Monthly income/expense trends, payment method breakdown, status counts' })
  @ApiQuery({ name: 'months', required: false, type: Number, description: 'Number of past months (default 12)' })
  getAnalytics(@Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number) {
    return this.paymentsService.getAnalytics(months);
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Key financial KPIs: collection rate, net profit, this-month vs last-month growth' })
  getKpis() {
    return this.paymentsService.getKpis();
  }

  @Get('aging')
  @ApiOperation({ summary: 'Accounts-receivable aging: outstanding debt bucketed by 0-30, 31-60, 61-90, 90+ days' })
  getAging() {
    return this.paymentsService.getAging();
  }

  @Get('patients/report')
  @ApiOperation({ summary: 'Per-patient financial summary: billed, paid, outstanding, collection rate' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number, description: 'Filter to one patient' })
  getPatientFinancials(@Query('patient_id') patientId?: string) {
    return this.paymentsService.getPatientFinancials(patientId ? BigInt(patientId) : undefined);
  }

  @Get()
  @ApiOperation({ summary: 'List payments with optional filters' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'appointment_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'paid', 'refunded', 'cancelled'] })
  @ApiQuery({ name: 'from', required: false, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id') patient_id?: string,
    @Query('appointment_id') appointment_id?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.paymentsService.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      appointment_id: appointment_id ? Number(appointment_id) : undefined,
      status,
      from,
      to,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single payment by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findOne(BigInt(id));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update payment status (pending → paid / refunded / cancelled)' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updateStatus(BigInt(id), dto);
  }
}

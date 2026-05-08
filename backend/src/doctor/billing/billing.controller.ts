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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Financial summary: total income (invoice payments), expenses, outstanding',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.billingService.getSummary({ from, to });
  }

  @Get('kpis')
  @ApiOperation({
    summary:
      'Key financial KPIs based on treatment invoices and invoice payments',
  })
  getKpis() {
    return this.billingService.getKpis();
  }

  @Get('invoice-payments')
  @ApiOperation({ summary: 'List raw invoice payment records (for charts)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listInvoicePayments(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.billingService.listInvoicePayments(limit);
  }

  @Post('invoices')
  @ApiOperation({
    summary: 'Create a treatment invoice with procedure line items',
  })
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.billingService.create(dto);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List treatment invoices with optional filters' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['open', 'partial', 'paid'],
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date YYYY-MM-DD',
  })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id', new DefaultValuePipe(0), ParseIntPipe)
    patient_id: number,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.billingService.findAll({
      patient_id: patient_id || undefined,
      status,
      from,
      to,
      page,
      limit,
    });
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get a single treatment invoice by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.billingService.findOne(BigInt(id));
  }

  @Patch('invoices/:id')
  @ApiOperation({ summary: 'Update a treatment invoice (date, notes, line items)' })
  updateInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.billingService.update(BigInt(id), dto);
  }

  @Delete('invoices/:id')
  @ApiOperation({ summary: 'Delete a treatment invoice and all its payments' })
  deleteInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.billingService.remove(BigInt(id));
  }

  @Post('invoices/:id/payments')
  @ApiOperation({
    summary: 'Record a payment (partial or full) against a treatment invoice',
  })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.billingService.recordPayment(BigInt(id), dto);
  }
}

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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@ApiBearerAuth()
@RequirePermissions('billing:read')
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
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
  ) {
    return this.billingService.listInvoicePayments(limit);
  }

  @Post('invoices')
  @RequirePermissions('billing:write')
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
    name: 'branch_id',
    required: false,
    type: Number,
    description: 'Only invoices issued by this branch',
  })
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
    @Query('branch_id', new DefaultValuePipe(0), ParseIntPipe)
    branch_id: number,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.billingService.findAll({
      patient_id: patient_id || undefined,
      branch_id: branch_id || undefined,
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

  @Post('invoices/:id/payments')
  @RequirePermissions('billing:write')
  @ApiOperation({
    summary: 'Record a payment (partial or full) against a treatment invoice',
  })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.billingService.recordPayment(BigInt(id), dto);
  }

  @Delete('invoices/:id')
  @RequirePermissions('billing:delete')
  @ApiOperation({
    summary: 'Delete a treatment invoice and all its payments and line items',
  })
  deleteInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.billingService.deleteInvoice(BigInt(id));
  }
}

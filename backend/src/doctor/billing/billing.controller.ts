import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('invoices')
  @ApiOperation({ summary: 'Create a treatment invoice with procedure line items' })
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.billingService.create(dto);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List treatment invoices with optional filters' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'partial', 'paid'] })
  @ApiQuery({ name: 'from', required: false, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id', new DefaultValuePipe(0), ParseIntPipe) patient_id: number,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
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

  @Post('invoices/:id/payments')
  @ApiOperation({ summary: 'Record a payment (partial or full) against a treatment invoice' })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.billingService.recordPayment(BigInt(id), dto);
  }
}

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/authorization/permissions.decorator';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import {
  CONFIRM_PASSWORD_HEADER,
  ConfirmedAdminGuard,
} from '../../shared/step-up/confirmed-admin.guard';
import { BillingService } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RefundDto } from './dto/refund.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';

type AuthedRequest = { user: RequestUser };

/** Swagger note shared by the two routes that ask for the admin's password. */
const PASSWORD_HEADER = {
  name: CONFIRM_PASSWORD_HEADER,
  description:
    "The signed-in admin's own password, re-entered for this request. Clinic admins only.",
  required: true,
};

/**
 * Billing. Money that has moved is never rewritten: corrections are refunds
 * (money back, with a reason) and voids (invoice cancelled, with a reason).
 * Deleting an invoice or a payment row is for pure mistakes, admin only, and
 * asks for the admin's password again (ConfirmedAdminGuard).
 */
@ApiBearerAuth()
@RequirePermissions('billing:read')
@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Financial summary: income (payments minus refunds), expenses, outstanding',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.billingService.getSummary({ from, to });
  }

  @Get('kpis')
  @ApiOperation({
    summary:
      'Key financial KPIs based on live invoices and payments minus refunds',
  })
  getKpis() {
    return this.billingService.getKpis();
  }

  @Get('invoice-payments')
  @ApiOperation({
    summary: 'List raw payment and refund rows (for charts)',
  })
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
    enum: ['open', 'partial', 'paid', 'cancelled'],
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

  @Post('invoices/:id/refunds')
  @RequirePermissions('billing:write')
  @ApiOperation({
    summary:
      'Return money to the patient: a refund row with a reason, never above what was received',
  })
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundDto,
    @Req() req: AuthedRequest,
  ) {
    return this.billingService.refund(BigInt(id), dto, BigInt(req.user.id));
  }

  @Post('invoices/:id/void')
  @RequirePermissions('billing:write')
  @ApiOperation({
    summary:
      'Cancel an invoice that is not owed: it stays on record as cancelled with the reason. Refund first if anything was paid.',
  })
  voidInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidInvoiceDto,
    @Req() req: AuthedRequest,
  ) {
    return this.billingService.voidInvoice(
      BigInt(id),
      dto,
      BigInt(req.user.id),
    );
  }

  @Delete('invoices/:id')
  @RequirePermissions('billing:delete')
  @UseGuards(ConfirmedAdminGuard)
  @ApiHeader(PASSWORD_HEADER)
  @ApiOperation({
    summary:
      'Delete an invoice that has no payments or refunds (clinic admin, password re-entered). Otherwise cancel it.',
  })
  deleteInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.billingService.deleteInvoice(BigInt(id), BigInt(req.user.id));
  }

  @Delete('payments/:id')
  @RequirePermissions('billing:delete')
  @UseGuards(ConfirmedAdminGuard)
  @ApiHeader(PASSWORD_HEADER)
  @ApiOperation({
    summary:
      'Delete one wrongly entered payment or refund row (clinic admin, password re-entered); the invoice totals follow',
  })
  deletePayment(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.billingService.deletePayment(BigInt(id), BigInt(req.user.id));
  }
}

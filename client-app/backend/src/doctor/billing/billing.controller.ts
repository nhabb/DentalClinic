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
import { PatientLedgerService } from './patient-ledger.service';
import { PlanService } from '../quotes/plan.service';
import {
  ApplyCreditDto,
  RefundCreditDto,
  TakePaymentDto,
} from './dto/ledger.dto';
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
  constructor(
    private readonly billingService: BillingService,
    private readonly ledgerService: PatientLedgerService,
    private readonly plans: PlanService,
  ) {}

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

  @Get('outstanding')
  @ApiOperation({
    summary:
      'Every balance still owed, with its invoice number, due date and days overdue (longest overdue first)',
  })
  getOutstanding() {
    return this.billingService.getOutstandingPayments();
  }

  @Get('aging')
  @ApiOperation({
    summary:
      'Accounts-receivable aging: outstanding balances by days past their due date',
  })
  getAging() {
    return this.billingService.getAgingReport();
  }

  @Get('invoice-payments')
  @ApiOperation({
    summary:
      'Every payment and refund, newest first: who paid, how, which bills it reached and who took it',
    description:
      'Windowed on payment_date — the day the money moved, which is the day every other report counts it on.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'from', required: false, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'End date YYYY-MM-DD' })
  @ApiQuery({ name: 'method', required: false, description: 'cash | card | …' })
  listInvoicePayments(
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('method') method?: string,
  ) {
    return this.billingService.listInvoicePayments(limit, { from, to, method });
  }

  @Get('patients/:patientId/billable')
  @RequirePermissions('billing:read', 'records:read')
  @ApiOperation({
    summary:
      "One patient's unbilled completed chart work (for the invoice builder) and open planned work (for the quote builder)",
    description:
      'Returns clinical chart rows, so it needs records:read as well as billing:read.',
  })
  listBillable(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.billingService.listBillable(BigInt(patientId));
  }

  // ── The patient ledger ───────────────────────────────────────────────────
  // Money belongs to the patient, not to one invoice: a deposit on an accepted
  // plan arrives long before the bills it will pay. These routes take money
  // without naming an invoice, then move it onto the bills as they are issued.

  @Get('patients/:patientId/ledger')
  @ApiOperation({
    summary:
      "One patient's account: credit on hand, what is still owed, and every payment with the invoices it was applied to",
  })
  ledger(@Param('patientId', ParseIntPipe) patientId: number) {
    return this.ledgerService.ledger(BigInt(patientId));
  }

  @Get('patients/:patientId/statement')
  @ApiOperation({
    summary:
      'The patient statement: their plan with where each line stands, every bill and payment, and the four figures kept apart (plan total, billed, received, credit) with Due now and Remaining on plan',
  })
  async statement(@Param('patientId', ParseIntPipe) patientId: number) {
    const id = BigInt(patientId);
    return this.ledgerService.statement(id, await this.plans.read(id));
  }

  @Post('patients/:patientId/payments')
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary:
      'Take money from a patient without naming an invoice (a deposit, or a payment at a visit); settles their open invoices oldest first unless auto_apply is false',
  })
  takePayment(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: TakePaymentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.ledgerService.takePayment(
      BigInt(patientId),
      dto,
      BigInt(req.user.id),
    );
  }

  @Post('payments/:paymentId/allocations')
  @RequirePermissions('billing:edit')
  @ApiOperation({
    summary:
      "Apply part of a patient's existing payment to one of their invoices",
  })
  applyCredit(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body() dto: ApplyCreditDto,
    @Req() req: AuthedRequest,
  ) {
    return this.ledgerService.applyCredit(
      BigInt(paymentId),
      dto,
      BigInt(req.user.id),
    );
  }

  @Delete('allocations/:id')
  @RequirePermissions('billing:edit')
  @ApiOperation({
    summary:
      'Take money back off an invoice and return it to the patient credit (not a refund: no money leaves the clinic)',
  })
  unapplyCredit(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthedRequest,
  ) {
    return this.ledgerService.unapplyCredit(BigInt(id), BigInt(req.user.id));
  }

  @Post('patients/:patientId/credit-refunds')
  @RequirePermissions('billing:edit')
  @ApiOperation({
    summary:
      'Hand unapplied credit back to the patient, with a reason (an abandoned plan)',
  })
  refundCredit(
    @Param('patientId', ParseIntPipe) patientId: number,
    @Body() dto: RefundCreditDto,
    @Req() req: AuthedRequest,
  ) {
    return this.ledgerService.refundCredit(
      BigInt(patientId),
      dto,
      BigInt(req.user.id),
    );
  }

  @Post('invoices')
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary:
      'Issue an invoice (numbered by the clinic) with procedure lines, an optional discount and a due date. A line naming a chart record bills that work and attaches it.',
  })
  createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: AuthedRequest) {
    return this.billingService.create(dto, BigInt(req.user.id));
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
  @RequirePermissions('billing:create')
  @ApiOperation({
    summary: 'Record a payment (partial or full) against a treatment invoice',
  })
  recordPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.billingService.recordPayment(
      BigInt(id),
      dto,
      BigInt(req.user.id),
    );
  }

  @Post('invoices/:id/refunds')
  @RequirePermissions('billing:edit')
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
  @RequirePermissions('billing:edit')
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

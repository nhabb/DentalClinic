import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  REMOTE_TX_OPTIONS,
} from '../../shared/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import {
  ApplyCreditDto,
  RefundCreditDto,
  TakePaymentDto,
} from './dto/ledger.dto';
import { EPSILON, LIVE_STATUSES, paymentDateFor, round2 } from './invoice-math';
import {
  appliedOf,
  appliedOfPayment,
  creditOf,
  creditOfPatient,
} from './money-sums';
import { OWED_INVOICES, patientMoneyFigures } from './money-figures';
import { MoneyService } from './money.service';
import { invoiceInclude, withAppliedPayments } from './invoice-shape';

/**
 * Just enough of a treatment plan to build a statement from. Taken as an
 * argument rather than fetched here, so billing does not have to depend on the
 * plan module to hand a patient their statement.
 */
export interface PlanSummary {
  totals: {
    plan: number;
    planned: number;
    done_unbilled: number;
    /** Chart price of the billed work — not what the invoices came to. */
    billed_value: number;
    /** Chart price of the work with no bill yet. */
    unbilled_value: number;
    unpriced_count: number;
  };
  lines: unknown[];
}

/**
 * The patient ledger: money belongs to the patient, not to an invoice.
 *
 * A treatment plan runs for months. The patient pays a deposit when the plan is
 * accepted, pays again at visits, and the bills appear one by one as procedures
 * are completed — so money regularly arrives before there is anything to put it
 * on. A payment therefore belongs to the patient; a `payment_allocations` row
 * is what pays an invoice down, and a payment that is not fully allocated is
 * credit on the account.
 *
 * Invariants the database keeps for us (migration
 * 20261017120000_patient_ledger_allocations): a payment can never be allocated
 * beyond its own amount, an allocation can only reach an invoice of the
 * payment's own patient, and a cancelled invoice takes no allocations at all.
 * Every write here goes through `MoneyService`, which is the only code in the
 * clinic that creates a payment, an allocation or a refund — the rules for
 * "pay this invoice" and "take money from this patient" are the same rules,
 * and they are kept in one place so they cannot drift apart again. The lock
 * order is that service's: invoices ascending by id, then payments ascending
 * by id.
 */
@Injectable()
export class PatientLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly money: MoneyService,
  ) {}

  /**
   * What the patient has paid, what is still owed, and what is sitting as
   * credit. One read for the whole account, which is what the billing page and
   * the treatment-plan view both need.
   */
  async ledger(patientId: bigint) {
    await this.requirePatient(patientId);

    const [payments, invoices] = await Promise.all([
      this.prisma.invoice_payments.findMany({
        where: { patient_id: patientId },
        include: {
          creator: { select: { id: true, first_name: true, last_name: true } },
          allocations: {
            select: {
              id: true,
              amount: true,
              invoice: {
                select: { id: true, invoice_number: true, status: true },
              },
            },
          },
        },
        orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.treatment_invoices.findMany({
        // "Open" here means still owed, which is `OWED_INVOICES` — the one
        // outstanding predicate, shared with every clinic-wide reader so that
        // this patient's unpaid balance and the clinic's cannot disagree.
        where: { patient_id: patientId, ...OWED_INVOICES },
        select: {
          id: true,
          invoice_number: true,
          status: true,
          due_date: true,
          total_amount: true,
          amount_paid: true,
          remaining_amount: true,
        },
        orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const rows = payments.map((p) => {
      const applied = appliedOf(p.allocations);
      return {
        ...p,
        applied: round2(applied),
        /** Still free to put on an invoice (or to hand back). */
        unapplied: round2(Number(p.amount) - applied),
      };
    });

    // Credit is received money that is not applied, less refunds that are not
    // applied either (a refund taken straight out of credit).
    const credit = creditOf(rows);
    const outstanding = invoices.reduce(
      (sum, i) => sum + Number(i.remaining_amount),
      0,
    );

    return {
      patient_id: patientId,
      credit_balance: round2(credit),
      outstanding_balance: round2(outstanding),
      payments: rows,
      open_invoices: invoices,
    };
  }

  /**
   * One patient's whole money picture, for the statement they are given.
   *
   * It composes the two things that already exist — the plan and the ledger —
   * and adds no storage of its own. The point is the four figures kept apart:
   * what the treatment will cost, what has been charged so far, what has been
   * received, and what is held as credit. "Due now" and "Remaining on plan"
   * are different questions and a statement that answers only one of them
   * misleads somebody: the patient wants to know what the course of treatment
   * still costs, the accountant wants to know what is owed today.
   */
  async statement(patientId: bigint, plan: PlanSummary) {
    const [ledger, figures] = await Promise.all([
      this.ledger(patientId),
      patientMoneyFigures(this.prisma, patientId),
    ]);

    return {
      plan,
      ledger,
      /**
       * The money side: every member is a sum of invoice or payment rows, and
       * every one of them comes from `money-figures.ts`, so this patient's
       * figures are the clinic's figures narrowed to them. Nothing is computed
       * here.
       */
      figures: {
        ...figures,
        /** @deprecated one release only — read `plan_figures.plan_value`. */
        plan_total: round2(plan.totals.plan),
        /** @deprecated one release only — read `plan_figures.unbilled_value`. */
        remaining_on_plan: round2(plan.totals.unbilled_value),
        /** @deprecated one release only — read `plan_figures.unpriced_lines`. */
        unpriced_lines: plan.totals.unpriced_count,
      },
      /**
       * The chart side: what the work is worth, from the plan's own prices.
       * Kept under its own key with `_value` names because it answers a
       * different question. `billed_value` is what the chart priced the billed
       * work at; `figures.billed` is what the invoices actually came to after
       * discounts and any charge that was never chart work. They are allowed
       * to differ, and comparing them is the mistake this split exists to
       * prevent.
       */
      plan_figures: {
        /** The whole course of treatment, billed or not. */
        plan_value: round2(plan.totals.plan),
        /** Of that, what has been put on an invoice, at the chart's price. */
        billed_value: round2(plan.totals.billed_value),
        /** Work with no bill yet: what the patient still faces. */
        unbilled_value: round2(plan.totals.unbilled_value),
        /** Reported so a never-priced line cannot pass as free treatment. */
        unpriced_lines: plan.totals.unpriced_count,
      },
    };
  }

  /**
   * Take money from the patient without naming an invoice. By default it
   * settles their open invoices oldest due first and keeps the rest as credit,
   * which is what a front desk means by "they paid 5000 today"; `auto_apply:
   * false` holds all of it ("save it for the implant").
   */
  async takePayment(patientId: bigint, dto: TakePaymentDto, actorId: bigint) {
    const amount = round2(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const paymentDate = paymentDateFor(dto.payment_date);
    await this.requirePatient(patientId);

    // Naming a bill is the desk saying "this is for that one". The money still
    // goes on the patient's account; the named invoice simply gets it first,
    // and anything beyond that bill follows auto_apply rather than being
    // refused — which is the difference between this and the old
    // invoice-bound door.
    const namedInvoiceId = dto.invoice_id
      ? await this.requireInvoiceOf(patientId, BigInt(dto.invoice_id))
      : undefined;

    const paymentId = await this.prisma.$transaction(async (tx) => {
      const payment = await this.money.createPaymentRow(tx, {
        patientId,
        kind: 'payment',
        amount,
        paymentMethod: dto.payment_method,
        paymentDate,
        notes: dto.notes?.trim() || null,
        actorId,
      });
      if (dto.auto_apply !== false || namedInvoiceId) {
        await this.money.settle(tx, {
          patientId,
          paymentId: payment.id,
          available: amount,
          actorId,
          firstInvoiceId: namedInvoiceId,
          limitToFirst: dto.auto_apply === false,
        });
      }
      return payment.id;
    }, REMOTE_TX_OPTIONS);

    await this.audit.record({
      actorId,
      action: 'billing.payment.take',
      table: 'invoice_payments',
      recordId: paymentId,
      after: {
        patient_id: patientId,
        amount,
        payment_method: dto.payment_method,
        auto_applied: dto.auto_apply !== false,
        invoice_id: namedInvoiceId ?? null,
      },
    });

    const ledger = await this.ledger(patientId);
    if (!namedInvoiceId) return ledger;
    // The desk named a bill, so hand that bill back as it now stands: the
    // screen that asked can redraw the row without a second request.
    const invoice = await this.prisma.treatment_invoices.findUnique({
      where: { id: namedInvoiceId },
      include: invoiceInclude,
    });
    return {
      ...ledger,
      invoice: invoice ? withAppliedPayments(invoice) : null,
    };
  }

  /**
   * Put part of a payment the patient already made onto one invoice.
   *
   * Both rows are locked, and in the house order: the invoice first, then the
   * payment. Two things can be raced for here — the invoice's balance and the
   * payment's unapplied amount — and taking them in the same sequence as
   * every other money route is what stops two desks deadlocking against each
   * other. The balance is read off the locked invoice row, which the
   * allocation trigger keeps, so it cannot go stale under us.
   */
  async applyCredit(paymentId: bigint, dto: ApplyCreditDto, actorId: bigint) {
    const amount = round2(dto.amount);
    const invoiceId = BigInt(dto.invoice_id);

    const patientId = await this.prisma.$transaction(async (tx) => {
      const invoice = await this.money.lockInvoice(tx, invoiceId);
      const payment = await this.money.lockPayment(tx, paymentId);

      // The database refuses this too; saying it here gives the desk a reason.
      if (invoice.patient_id !== payment.patient_id) {
        throw new BadRequestException(
          'That invoice belongs to another patient; credit cannot move between patients',
        );
      }
      if (invoice.status === 'cancelled') {
        throw new ConflictException(
          'This invoice is cancelled and takes no payments',
        );
      }

      const free = round2(
        Number(payment.amount) - (await appliedOfPayment(tx, paymentId)),
      );
      if (free <= EPSILON) {
        throw new ConflictException(
          'This payment is already fully applied to invoices',
        );
      }
      if (amount > free + EPSILON) {
        throw new BadRequestException(
          `Only ${free} of this payment is left to apply`,
        );
      }

      const owed = invoice.remaining_amount;
      if (owed <= EPSILON) {
        throw new BadRequestException('This invoice is already fully paid');
      }
      if (amount > owed + EPSILON) {
        throw new BadRequestException(
          `Applying ${amount} exceeds the balance of this invoice (${round2(owed)})`,
        );
      }

      await this.money.allocate(tx, {
        paymentId,
        invoiceId,
        amount,
        actorId,
      });
      return payment.patient_id;
    }, REMOTE_TX_OPTIONS);

    await this.audit.record({
      actorId,
      action: 'billing.credit.apply',
      table: 'payment_allocations',
      recordId: paymentId,
      after: { payment_id: paymentId, invoice_id: invoiceId, amount },
    });
    return this.ledger(patientId);
  }

  /**
   * Take money back off an invoice without refunding it: it returns to the
   * patient's credit. For a misapplied payment ("that was meant for the
   * implant"), not for money leaving the clinic — that is a refund.
   */
  async unapplyCredit(allocationId: bigint, actorId: bigint) {
    const allocation = await this.prisma.payment_allocations.findUnique({
      where: { id: allocationId },
      include: {
        payment: { select: { patient_id: true, kind: true } },
        invoice: { select: { id: true, status: true, invoice_number: true } },
      },
    });
    if (!allocation) throw new NotFoundException('Allocation not found');
    // A refund's allocation is what subtracts the money from the invoice.
    // Removing it would raise amount_paid back to what it was before the cash
    // was handed over, and lockPayment would not let it be applied again. The
    // database refuses this too (payment_allocations_refund_stays).
    if (allocation.payment.kind === 'refund') {
      throw new BadRequestException(
        'A refund cannot be unapplied: it records money that has left the clinic. Delete the refund row instead (clinic admin, password re-entered).',
      );
    }
    if (allocation.invoice.status === 'cancelled') {
      throw new ConflictException(
        'This invoice is cancelled; the money applied to it stays as it is',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.money.lockInvoice(tx, allocation.invoice.id);
      await tx.payment_allocations.delete({ where: { id: allocationId } });
    }, REMOTE_TX_OPTIONS);

    await this.audit.record({
      actorId,
      action: 'billing.credit.unapply',
      table: 'payment_allocations',
      recordId: allocationId,
      before: {
        payment_id: allocation.payment_id,
        invoice_id: allocation.invoice_id,
        invoice_number: allocation.invoice.invoice_number,
        amount: allocation.amount,
      },
    });
    return this.ledger(allocation.payment.patient_id);
  }

  /**
   * Hand unapplied credit back to the patient — the abandoned-plan case. It is
   * a refund row like any other, but applied to no invoice, so it reduces the
   * credit balance and no invoice's totals.
   */
  async refundCredit(patientId: bigint, dto: RefundCreditDto, actorId: bigint) {
    const amount = round2(dto.amount);
    const paymentDate = paymentDateFor(dto.payment_date);
    await this.requirePatient(patientId);

    const refundId = await this.prisma.$transaction(async (tx) => {
      // Lock every payment row of this patient for the rest of the
      // transaction, so a credit balance cannot be refunded twice over.
      await this.money.lockPaymentsOfPatient(tx, patientId);
      const credit = await creditOfPatient(tx, patientId);
      if (credit <= EPSILON) {
        throw new BadRequestException(
          'This patient has no credit on their account',
        );
      }
      if (amount > credit + EPSILON) {
        throw new BadRequestException(
          `Refund (${amount}) exceeds the credit on this account (${credit})`,
        );
      }
      // No allocation: this money never sat on an invoice, so handing it back
      // lowers the credit balance and touches no invoice's totals.
      const refund = await this.money.createPaymentRow(tx, {
        patientId,
        kind: 'refund',
        // Credit handed back: no invoice is involved, so no allocation follows.
        refundScope: 'credit',
        amount,
        paymentMethod: dto.payment_method,
        paymentDate,
        reason: dto.reason.trim(),
        actorId,
      });
      return refund.id;
    }, REMOTE_TX_OPTIONS);

    await this.audit.record({
      actorId,
      action: 'billing.credit.refund',
      table: 'invoice_payments',
      recordId: refundId,
      after: {
        patient_id: patientId,
        amount,
        payment_method: dto.payment_method,
        reason: dto.reason,
      },
    });
    return this.ledger(patientId);
  }

  /**
   * The named invoice must be this patient's and still take money. The
   * database refuses a cross-patient allocation anyway; checking here is what
   * turns that into a sentence the desk can act on.
   */
  private async requireInvoiceOf(patientId: bigint, invoiceId: bigint) {
    const invoice = await this.prisma.treatment_invoices.findUnique({
      where: { id: invoiceId },
      select: { id: true, patient_id: true, status: true },
    });
    if (!invoice) throw new NotFoundException('Treatment invoice not found');
    if (invoice.patient_id !== patientId) {
      throw new BadRequestException(
        'That invoice belongs to another patient; money cannot move between patients',
      );
    }
    if (invoice.status === 'cancelled') {
      throw new ConflictException(
        'This invoice is cancelled and takes no payments',
      );
    }
    return invoice.id;
  }

  private async requirePatient(patientId: bigint) {
    const patient = await this.prisma.patient_profiles.findUnique({
      where: { id: patientId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tx } from '../../shared/prisma/prisma.service';
import { EPSILON, LIVE_STATUSES, round2 } from './invoice-math';
import { invoiceInclude, withAppliedPayments } from './invoice-shape';
import { mapMoneyConstraint, MoneyConstraint } from './money-errors';

/**
 * The one place money is written.
 *
 * Every payment, refund and allocation in the clinic goes through this
 * service. It exists because the same rules used to be implemented twice —
 * once for "pay this invoice" and once for "take money from this patient" —
 * and the two copies disagreed about which row to lock and which number to
 * trust. A balance that depends on which button the desk pressed is not a
 * balance.
 *
 * **The locked invoice row is the truth.** `app.recalc_invoice_totals`
 * (migration 20261017120000_patient_ledger_allocations) updates
 * `treatment_invoices` from an AFTER trigger on `payment_allocations`, so a
 * concurrent writer blocks inside its own trigger until our transaction ends.
 * Taking `SELECT ... FOR UPDATE` on the invoice therefore serialises every
 * allocation that touches it, and the `remaining_amount` on the row we hold is
 * authoritative for as long as we hold it. Nothing here recomputes totals by
 * hand: the trigger owns them.
 *
 * **One lock order: invoices ascending by id, then payments ascending by id.**
 * Deadlocks between two desks are prevented by everyone taking the same locks
 * in the same sequence, so every method in this file obeys it and so must any
 * caller that locks something itself.
 */
/** Which kind of refund a row records; see `createPaymentRow`. */
export type RefundScope = 'invoice' | 'credit';

type PaymentRowBase = {
  patientId: bigint;
  amount: number;
  paymentMethod: string;
  paymentDate: Date;
  notes?: string | null;
  reason?: string | null;
  actorId: bigint;
};

/**
 * A payment carries no scope; a refund must carry one. Written as a
 * discriminated union so the compiler, not a reviewer, is what catches a
 * refund that forgot to say which kind it is.
 */
export type CreatePaymentRow =
  | (PaymentRowBase & { kind: 'payment'; refundScope?: never })
  | (PaymentRowBase & { kind: 'refund'; refundScope: RefundScope });

/** An invoice held under `FOR UPDATE`, with its figures as plain numbers. */
export interface LockedInvoice {
  id: bigint;
  patient_id: bigint;
  status: string;
  total_amount: number;
  /** Received net of refunds, as the allocation trigger last computed it. */
  amount_paid: number;
  /** Still owed. Authoritative for as long as the lock is held. */
  remaining_amount: number;
}

@Injectable()
export class MoneyService {
  /** An invoice row held for the rest of the transaction, figures as numbers. */
  async lockInvoice(tx: Tx, invoiceId: bigint): Promise<LockedInvoice> {
    const [locked] = await tx.$queryRaw<
      {
        id: bigint;
        patient_id: bigint;
        total_amount: unknown;
        amount_paid: unknown;
        remaining_amount: unknown;
        status: string;
      }[]
    >`SELECT id, patient_id, total_amount, amount_paid, remaining_amount, status FROM treatment_invoices WHERE id = ${invoiceId} FOR UPDATE`;
    if (!locked) throw new NotFoundException('Treatment invoice not found');
    return {
      id: locked.id,
      patient_id: locked.patient_id,
      status: locked.status,
      total_amount: Number(locked.total_amount),
      amount_paid: Number(locked.amount_paid),
      remaining_amount: Number(locked.remaining_amount),
    };
  }

  /**
   * Several invoices at once, always in ascending id order whatever order the
   * caller wants to spend them in. The returned map is keyed by id.
   */
  async lockInvoices(tx: Tx, invoiceIds: bigint[]) {
    const ordered = [...new Set(invoiceIds)].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const locked = new Map<bigint, LockedInvoice>();
    for (const id of ordered) {
      locked.set(id, await this.lockInvoice(tx, id));
    }
    return locked;
  }

  /**
   * A payment row held for the rest of the transaction. Its unapplied amount
   * is the thing two desks applying the same credit race for.
   */
  async lockPayment(tx: Tx, paymentId: bigint) {
    const [locked] = await tx.$queryRaw<
      { id: bigint; patient_id: bigint; amount: unknown; kind: string }[]
    >`SELECT id, patient_id, amount, kind FROM invoice_payments WHERE id = ${paymentId} FOR UPDATE`;
    if (!locked) throw new NotFoundException('Payment not found');
    if (locked.kind !== 'payment') {
      throw new BadRequestException('A refund cannot be applied to an invoice');
    }
    return locked;
  }

  /**
   * Every payment row of one patient, so a credit balance cannot be spent or
   * refunded twice over. Ordered by id, like every other payment lock here.
   */
  async lockPaymentsOfPatient(tx: Tx, patientId: bigint) {
    await tx.$queryRaw`SELECT id FROM invoice_payments WHERE patient_id = ${patientId} ORDER BY id FOR UPDATE`;
  }

  /**
   * Record that money moved. It belongs to the patient; allocating it is a
   * separate act.
   *
   * A refund must say which kind it is, and the type makes that compulsory:
   * an `invoice` refund takes money back off a named bill and is followed by
   * an allocation, a `credit` refund hands back money that never sat on a bill
   * and touches no invoice. They used to be indistinguishable once written,
   * which made every income report add them together.
   */
  async createPaymentRow(tx: Tx, input: CreatePaymentRow) {
    return tx.invoice_payments.create({
      data: {
        patient_id: input.patientId,
        kind: input.kind,
        refund_scope: input.kind === 'refund' ? input.refundScope : null,
        amount: input.amount,
        payment_method: input.paymentMethod,
        payment_date: input.paymentDate,
        notes: input.notes ?? null,
        reason: input.reason ?? null,
        created_by: input.actorId,
      },
    });
  }

  /**
   * Put part of a payment onto one invoice. The caller must already hold that
   * invoice's lock, because the allocation's trigger will recompute its
   * totals. A refund's allocation subtracts, which is how a refund lowers what
   * an invoice shows as received.
   */
  async allocate(
    tx: Tx,
    input: {
      paymentId: bigint;
      invoiceId: bigint;
      amount: number;
      actorId: bigint;
    },
    overrides: Partial<Record<MoneyConstraint, string>> = {},
  ) {
    try {
      return await tx.payment_allocations.create({
        data: {
          payment_id: input.paymentId,
          invoice_id: input.invoiceId,
          amount: input.amount,
          created_by: input.actorId,
        },
      });
    } catch (err) {
      mapMoneyConstraint(err, overrides);
    }
  }

  /**
   * Spend a payment across the patient's open invoices, oldest due first, and
   * answer how much of it is left over — that remainder is the patient's
   * credit.
   *
   * `firstInvoiceId` puts one bill at the head of the queue: it is what the
   * desk means by "this payment is for that invoice", while anything beyond
   * that invoice's balance still flows on to the next oldest rather than being
   * refused.
   *
   * The invoices are chosen in due-date order but **locked in id order**, and
   * the balance each one is paid against is read from the locked row, not from
   * the earlier unlocked listing. Reading the stale figure would land money on
   * the wrong invoice in amounts that still add up — a mistake that leaves the
   * totals looking correct.
   */
  async settle(
    tx: Tx,
    input: {
      patientId: bigint;
      paymentId: bigint;
      available: number;
      actorId: bigint;
      firstInvoiceId?: bigint;
      /** With `firstInvoiceId`: put money on that bill only, hold the rest. */
      limitToFirst?: boolean;
    },
  ): Promise<number> {
    const open = await tx.treatment_invoices.findMany({
      where: {
        patient_id: input.patientId,
        status: { in: [...LIVE_STATUSES] },
        remaining_amount: { gt: 0 },
      },
      select: { id: true },
      orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
    });

    // The order money is spent in; the named invoice jumps the queue, and
    // `limitToFirst` means it is the only one spent on.
    const queue = open.map((i) => i.id);
    const order = input.firstInvoiceId
      ? input.limitToFirst
        ? [input.firstInvoiceId]
        : [
            input.firstInvoiceId,
            ...queue.filter((id) => id !== input.firstInvoiceId),
          ]
      : queue;
    if (order.length === 0) return round2(input.available);

    const locked = await this.lockInvoices(tx, order);

    let left = input.available;
    for (const invoiceId of order) {
      if (left <= EPSILON) break;
      const invoice = locked.get(invoiceId);
      // Settled or cancelled since the listing: the lock is what tells us.
      if (!invoice || invoice.status === 'cancelled') continue;
      if (invoice.remaining_amount <= EPSILON) continue;
      const part = round2(Math.min(left, invoice.remaining_amount));
      if (part <= EPSILON) continue;
      await this.allocate(tx, {
        paymentId: input.paymentId,
        invoiceId,
        amount: part,
        actorId: input.actorId,
      });
      left = round2(left - part);
    }
    return round2(left);
  }

  /**
   * Remove a payment or refund row. Its allocations cascade with it and the
   * invoice totals follow by trigger; the caller holds the locks on every
   * invoice it touched.
   */
  async removePayment(
    tx: Tx,
    paymentId: bigint,
    overrides: Partial<Record<MoneyConstraint, string>> = {},
  ) {
    try {
      return await tx.invoice_payments.delete({ where: { id: paymentId } });
    } catch (err) {
      mapMoneyConstraint(err, overrides);
    }
  }

  /**
   * The invoice as every route returns it, read back after the trigger has
   * moved its totals. This replaces writing the totals from the application:
   * the database computed them, so the database is what we read.
   */
  async reloadInvoice(tx: Tx, invoiceId: bigint) {
    const invoice = await tx.treatment_invoices.findUnique({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Treatment invoice not found');
    return withAppliedPayments(invoice);
  }
}

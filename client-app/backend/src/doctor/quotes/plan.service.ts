import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../../shared/audit/audit.service';
import { round2 } from '../billing/invoice-math';
import { agreementIsStale, planDigest } from './plan-digest';
import {
  isBilledState,
  PLAN_RECORD_TYPES,
  planLineState,
  type PlanInvoiceStatus,
  type PlanLineState,
} from './plan-record-types';

/**
 * The treatment plan, which is also the quote.
 *
 * There is one plan per patient and it lives on the dental chart: the planned
 * and completed rows of `patient_records` *are* the plan, and what used to be a
 * separate list of quote lines is now computed from them whenever anyone asks.
 * Nothing is kept in step, because nothing is duplicated.
 *
 * That is what makes a plan changeable mid-treatment, which is the normal case
 * in dentistry and was impossible before: work can be added, repriced or
 * dropped at any point, including after the patient agreed and after some of it
 * has been billed.
 *
 * **A billed line is frozen, and the row says so itself.** The lock is
 * `patient_records.invoice_id`, not the status of some document: once work is
 * on an invoice, its price belongs to that invoice. Everything else stays
 * editable. `repriceRecord` and the billing claim enforce the same rule, and
 * the `patient_records_billed_once` trigger is the backstop.
 *
 * **The quote row is a header, not a copy.** It holds the patient's plan
 * number, their notes and the day they accepted — no status, no version, no
 * total. What a patient was actually handed is in `quote_sends`, which is
 * append-only: the living plan cannot also be the record of what was promised.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The patient's one plan header, created if they have none. Called when work
   * is first recorded; reading a plan never creates one.
   */
  async ensure(patientId: bigint, actorId: bigint | null) {
    const existing = await this.header(patientId);
    if (existing) return existing;
    return this.prisma.quotes.create({
      data: { patient_id: patientId, created_by: actorId },
      select: {
        id: true,
        quote_number: true,
        notes: true,
        accepted_at: true,
        accepted_digest: true,
      },
    });
  }

  /**
   * The plan as every screen reads it: the lines with where each one stands,
   * the figures, and when it was last given to the patient.
   */
  async read(patientId: bigint) {
    const header = await this.header(patientId);

    const rows = await this.prisma.patient_records.findMany({
      where: {
        patient_id: patientId,
        record_type: { in: [...PLAN_RECORD_TYPES] },
      },
      orderBy: [{ treatment_date: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        tooth_number: true,
        treatment_date: true,
        quoted_amount: true,
        record_type: true,
        invoice_id: true,
        // The invoice is already joined, so asking it how far it has been
        // settled costs nothing. It is what lets a plan line say "paid"
        // rather than stopping at "billed", which is all the chart could ever
        // tell anyone before.
        invoice: {
          select: {
            id: true,
            invoice_number: true,
            status: true,
            total_amount: true,
            amount_paid: true,
            remaining_amount: true,
            due_date: true,
          },
        },
      },
    });

    const lines = rows.map((r) => {
      // The lock is the row's own invoice link, not any document's status.
      const locked = r.invoice_id !== null;
      const invoiceStatus = (locked
        ? (r.invoice?.status ?? 'open')
        : null) as PlanInvoiceStatus;
      return {
        record_id: r.id,
        procedure: r.title,
        tooth: r.tooth_number,
        date: r.treatment_date,
        /** null means nobody has priced this yet; it is never treated as 0. */
        amount: r.quoted_amount === null ? null : Number(r.quoted_amount),
        state: planLineState(r.record_type, invoiceStatus),
        locked,
        invoice_id: r.invoice_id,
        /** The bill's own word, copied — never recomputed here. */
        invoice_status: invoiceStatus,
        invoice_number: r.invoice?.invoice_number ?? null,
      };
    });

    // A line with no price is counted, not guessed at. Summing it as zero
    // would quietly shrink the plan total and nobody would see why.
    const sumWhere = (keep: (l: (typeof lines)[number]) => boolean) =>
      round2(lines.filter(keep).reduce((s, l) => s + (l.amount ?? 0), 0));
    const countOf = (want: PlanLineState) =>
      lines.filter((l) => l.state === want).length;

    /*
     * What this plan's billed work turned into, over the DISTINCT invoices it
     * produced — two lines on one bill must not count that bill twice.
     *
     * These are money figures, so they are kept apart from the chart's own
     * `totals` below. They cover only the invoices this plan produced, which
     * is a subset of the patient's: a bill of pure non-chart charges (a
     * consultation, a product) is not here, so this is not the patient's
     * balance. `/billing/patients/:id/statement` answers that.
     */
    const planInvoices = new Map<
      string,
      { total: number; paid: number; due: number }
    >();
    for (const r of rows) {
      if (!r.invoice_id || !r.invoice) continue;
      planInvoices.set(String(r.invoice_id), {
        total: Number(r.invoice.total_amount),
        paid: Number(r.invoice.amount_paid),
        due: Number(r.invoice.remaining_amount),
      });
    }
    const overInvoices = (pick: (i: { total: number; paid: number; due: number }) => number) =>
      round2([...planInvoices.values()].reduce((s, i) => s + pick(i), 0));

    // What the patient would be agreeing to, as it stands now. Compared
    // with what they did agree to, this is how the desk learns that the
    // plan has moved on since.
    const digest = planDigest(lines);

    const sends = header
      ? await this.prisma.quote_sends.findMany({
          where: { quote_id: header.id },
          orderBy: { created_at: 'desc' },
          take: 20,
          select: {
            id: true,
            quoted_total: true,
            created_at: true,
            sender: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        })
      : [];

    return {
      patient_id: patientId,
      quote_id: header?.id ?? null,
      quote_number: header?.quote_number ?? null,
      notes: header?.notes ?? null,
      accepted_at: header?.accepted_at ?? null,
      /** The plan they agreed to, fingerprinted. */
      digest,
      /** Agreed once, but the plan has changed since: agree again. */
      agreement_stale: agreementIsStale(
        header?.accepted_at ?? null,
        header?.accepted_digest ?? null,
        digest,
      ),
      lines,
      /**
       * The chart side: what the work is worth at the prices the chart holds.
       * `billed_value` is NOT what the invoices came to — a discount or a
       * charge that was never chart work makes the two differ by design — so
       * it is named for the question it answers. The money side is
       * `settlement` below, and the patient's whole position is the statement.
       */
      totals: {
        /** The whole course of treatment, billed and unbilled alike. */
        plan: sumWhere(() => true),
        planned: sumWhere((l) => l.state === 'planned'),
        done_unbilled: sumWhere((l) => l.state === 'done'),
        /** Chart price of the work that is on a bill, however it was settled. */
        billed_value: sumWhere((l) => isBilledState(l.state)),
        /** Chart price of the work with no bill yet. */
        unbilled_value: sumWhere((l) => !isBilledState(l.state)),
        unpriced_count: lines.filter((l) => l.amount === null).length,
      },
      /**
       * `planned`, `done` and `billed` are the three exclusive buckets, and
       * `billed` keeps meaning "on a bill" however that bill was settled — a
       * line that has since been paid has not stopped being billed. `part_paid`
       * and `paid` are subsets of it, reported so a screen can show how far
       * the billed work has been collected without counting lines twice.
       */
      counts: {
        planned: countOf('planned'),
        done: countOf('done'),
        billed: lines.filter((l) => isBilledState(l.state)).length,
        part_paid: countOf('part_paid'),
        paid: countOf('paid'),
      },
      /** The money this plan's work turned into, over its distinct invoices. */
      settlement: {
        invoice_count: planInvoices.size,
        invoiced_total: overInvoices((i) => i.total),
        received: overInvoices((i) => i.paid),
        due: overInvoices((i) => i.due),
      },
      sends,
    };
  }

  /** The same projection, reached by the plan's own id. */
  async readById(quoteId: bigint) {
    return this.read(await this.patientOf(quoteId));
  }

  /** A note on the plan; the only thing on the header a person edits. */
  async setNotes(quoteId: bigint, notes: string | null, actorId: bigint) {
    const patientId = await this.patientOf(quoteId);
    await this.prisma.quotes.update({
      where: { id: quoteId },
      data: { notes: notes?.trim() || null, updated_at: new Date() },
    });
    await this.audit.record({
      actorId,
      action: 'billing.plan.notes',
      table: 'quotes',
      recordId: quoteId,
    });
    return this.read(patientId);
  }

  /**
   * Give the plan to the patient. The plan itself is unchanged — what this
   * writes is the record of what they were handed, so that months later,
   * after the plan has moved on, "you told me 1,400" has an answer.
   */
  async send(quoteId: bigint, actorId: bigint) {
    const patientId = await this.patientOf(quoteId);

    const plan = await this.read(patientId);
    await this.prisma.quote_sends.create({
      data: {
        quote_id: quoteId,
        sent_by: actorId,
        quoted_total: plan.totals.plan,
        quoted_lines: plan.lines.map((l) => ({
          tooth: l.tooth,
          procedure: l.procedure,
          amount: l.amount,
          state: l.state,
        })),
      },
    });
    await this.audit.record({
      actorId,
      action: 'billing.plan.send',
      table: 'quote_sends',
      recordId: quoteId,
      after: { total: plan.totals.plan, lines: plan.lines.length },
    });
    return this.read(patientId);
  }

  /**
   * Record that the patient agreed. It is a fact with a date, and it gates
   * nothing: the plan was already editable and stays editable, because
   * treatment changes and the chart has to be allowed to say so.
   */
  async accept(quoteId: bigint, actorId: bigint) {
    const patientId = await this.patientOf(quoteId);
    // Record WHAT was agreed to, not only that something was. Without this
    // the date outlives the plan it was given for.
    const agreed = await this.read(patientId);
    await this.prisma.quotes.update({
      where: { id: quoteId },
      data: {
        accepted_at: new Date(),
        accepted_digest: agreed.digest,
        updated_at: new Date(),
      },
    });
    await this.audit.record({
      actorId,
      action: 'billing.plan.accept',
      table: 'quotes',
      recordId: quoteId,
    });
    return this.read(patientId);
  }

  /** Every patient's plan, for the clinic-wide list. Two queries, not N+1. */
  async list() {
    const headers = await this.prisma.quotes.findMany({
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        quote_number: true,
        accepted_at: true,
        updated_at: true,
        patient_id: true,
        patient: {
          select: {
            id: true,
            users: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });
    if (headers.length === 0) return [];

    const sums = await this.prisma.patient_records.groupBy({
      by: ['patient_id'],
      where: {
        patient_id: { in: headers.map((h) => h.patient_id) },
        record_type: { in: [...PLAN_RECORD_TYPES] },
      },
      _sum: { quoted_amount: true },
      _count: { id: true },
    });
    const byPatient = new Map(sums.map((s) => [s.patient_id, s]));

    return headers.map((h) => {
      const s = byPatient.get(h.patient_id);
      return {
        ...h,
        plan_total: round2(Number(s?._sum.quoted_amount ?? 0)),
        line_count: Number(s?._count.id ?? 0),
      };
    });
  }

  /**
   * The patient's one plan header. The oldest row wins while more than one can
   * still exist; migration 20261018130000 makes that impossible.
   */
  /** The patient a plan belongs to, or 404. */
  private async patientOf(quoteId: bigint): Promise<bigint> {
    const header = await this.prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { patient_id: true },
    });
    if (!header) throw new NotFoundException('Treatment plan not found');
    return header.patient_id;
  }

  private header(patientId: bigint) {
    return this.prisma.quotes.findFirst({
      where: { patient_id: patientId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        quote_number: true,
        notes: true,
        accepted_at: true,
        accepted_digest: true,
      },
    });
  }
}

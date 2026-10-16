import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Tx } from '../../shared/prisma/prisma.service';

/**
 * The plan is the quote.
 *
 * Planning work on the dental chart prices it there, and this keeps one quote
 * per patient in step with that plan: add, reprice or drop planned work and
 * the quote follows, so the paper the patient is given always matches the
 * chart. The quote is created as a **draft**: it needs a person to confirm it
 * (give it to the patient, or record that they accepted).
 *
 * It keeps following the plan after confirmation too, by request — with one
 * stop: **a quote that has a live invoice is frozen**. Money has moved against
 * those figures, and a quote that drifted from its own invoice would make the
 * two disagree. Changing the plan then leaves the billed quote alone and the
 * next sync starts a fresh draft for the work that is still unbilled.
 */
@Injectable()
export class PlanQuoteService {
  private readonly logger = new Logger(PlanQuoteService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Statuses a quote can be in and still be the patient's working quote. */
  private static readonly OPEN_STATUSES = ['draft', 'sent', 'accepted'];

  /**
   * Rebuild the patient's working quote from their planned chart work.
   * Safe to call after any chart change; it does nothing when there is
   * nothing to quote.
   */
  async sync(patientId: bigint, actorId: bigint | null): Promise<void> {
    try {
      await this.prisma.$transaction((tx) =>
        this.syncIn(tx, patientId, actorId),
      );
    } catch (err) {
      // A chart edit must not fail because its quote could not be refreshed;
      // the next change (or a manual revision) will put it right.
      this.logger.error(
        `Could not sync the plan quote for patient ${patientId}: ${(err as Error).message}`,
      );
    }
  }

  /** The same work, inside a transaction the caller already owns. */
  async syncIn(
    tx: Tx,
    patientId: bigint,
    actorId: bigint | null,
  ): Promise<void> {
    // The plan: work proposed on the chart that no invoice covers yet.
    const planned = await tx.patient_records.findMany({
      where: {
        patient_id: patientId,
        record_type: 'treatment_plan',
        invoice_id: null,
      },
      select: {
        id: true,
        title: true,
        tooth_number: true,
        quoted_amount: true,
      },
      orderBy: [{ treatment_date: 'asc' }, { id: 'asc' }],
    });

    const current = await tx.quotes.findFirst({
      where: {
        patient_id: patientId,
        status: { in: PlanQuoteService.OPEN_STATUSES },
        // A billed quote is frozen, so it is not the one that follows the
        // plan: work planned afterwards belongs on a fresh draft.
        invoices: { none: { status: { not: 'cancelled' } } },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        quoted_discount: true,
        invoices: {
          where: { status: { not: 'cancelled' } },
          select: { id: true },
        },
      },
    });

    // Belt and braces: the query already skips billed quotes, and if one ever
    // reaches here its figures are an invoice's now, not the plan's.
    if (current && current.invoices.length > 0) return;

    if (planned.length === 0) {
      // Nothing planned: an unconfirmed draft has nothing to say, so it goes.
      // A confirmed quote stays as the record of what was agreed.
      if (current?.status === 'draft') {
        await tx.quotes.delete({ where: { id: current.id } });
      }
      return;
    }

    const lines = planned.map((r) => ({
      record_id: r.id,
      procedure_name: r.title,
      tooth_number: r.tooth_number,
      quoted_amount: r.quoted_amount ?? 0,
    }));

    if (!current) {
      await tx.quotes.create({
        data: {
          patient_id: patientId,
          status: 'draft',
          created_by: actorId,
          items: { create: lines },
        },
      });
      return;
    }

    // Replace the lines wholesale: the plan is the truth, and a trigger
    // recomputes quoted_total from the lines and the discount.
    await tx.quote_items.deleteMany({ where: { quote_id: current.id } });
    await tx.quote_items.createMany({
      data: lines.map((l) => ({ ...l, quote_id: current.id })),
    });
    await tx.quotes.update({
      where: { id: current.id },
      data: { updated_at: new Date() },
    });
  }
}

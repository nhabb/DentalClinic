import { BadRequestException, ConflictException } from '@nestjs/common';
import { QuotesService } from './quotes.service';

type Quote = {
  id: bigint;
  patient_id: bigint;
  branch_id: bigint | null;
  quote_number: string;
  version: number;
  supersedes_id: bigint | null;
  status: string;
  valid_until: Date | null;
  notes: string | null;
  quoted_discount: number;
  quoted_total: number;
  sent_at: Date | null;
  items: {
    record_id: bigint | null;
    procedure_name: string;
    tooth_number: string | null;
    description: string | null;
    quoted_amount: number;
  }[];
  invoices: { id: bigint; invoice_number: string; status: string }[];
};

type BilledRecord = {
  title: string;
  tooth_number: string | null;
  invoice: { invoice_number: string } | null;
};

/**
 * A fake database holding a few quotes; writes are recorded, not applied.
 * `billed` is what the "is any of this work already on an invoice?" lookup
 * returns.
 */
function build(quotes: Quote[], billed: BilledRecord[] = []) {
  const byId = (id: bigint) => quotes.find((q) => q.id === id) ?? null;
  const tx = {
    quotes: {
      findUnique: jest.fn(({ where }: { where: { id: bigint } }) =>
        Promise.resolve(byId(where.id)),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: bigint }; data: object }) =>
          Promise.resolve({ ...byId(where.id), ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: bigint } }) =>
        Promise.resolve(byId(where.id)),
      ),
    },
    quote_items: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    patient_records: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    treatment_invoices: {
      create: jest.fn().mockResolvedValue({ id: 77n }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 77n,
        invoice_number: 'INV-2026-00077',
        total_amount: 220,
      }),
    },
  };
  const prisma = {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    quotes: {
      ...tx.quotes,
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 99n, ...data }),
      ),
      delete: jest.fn().mockResolvedValue({}),
    },
    patient_profiles: { findUnique: jest.fn().mockResolvedValue({ id: 7n }) },
    patient_records: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue(billed),
    },
    // The quote conversion writes inside the transaction.
    treatment_invoices: tx.treatment_invoices,
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new QuotesService(prisma as never, audit as never);
  return { service, tx, prisma, audit };
}

const quote = (over: Partial<Quote>): Quote => ({
  id: 1n,
  patient_id: 7n,
  branch_id: null,
  quote_number: 'QUO-2026-00001',
  version: 1,
  supersedes_id: null,
  status: 'draft',
  valid_until: null,
  notes: null,
  quoted_discount: 0,
  quoted_total: 250,
  sent_at: null,
  items: [
    {
      record_id: 500n,
      procedure_name: 'Crown',
      tooth_number: '16',
      description: null,
      quoted_amount: 250,
    },
  ],
  invoices: [],
  ...over,
});

const ACTOR = 21n;

const createdData = (prisma: ReturnType<typeof build>['prisma']) =>
  prisma.quotes.create.mock.calls[0][0].data;

describe('QuotesService: preparing a quote', () => {
  it('creates a draft, version 1, with the lines, their sum and the discount', async () => {
    const { service, prisma } = build([]);
    await service.create(
      {
        patient_id: 7,
        quoted_discount: 20.5,
        items: [
          {
            record_id: 500,
            procedure_name: 'Crown',
            tooth_number: '16',
            amount: 250,
          },
          { procedure_name: 'X-Ray', amount: 20.5 },
        ],
      },
      ACTOR,
    );
    expect(createdData(prisma)).toMatchObject({
      patient_id: 7n,
      version: 1,
      status: 'draft',
      quoted_discount: 20.5,
      quoted_total: 250,
      created_by: ACTOR,
    });
  });

  it('refuses a discount larger than the lines', async () => {
    const { service, prisma } = build([]);
    await expect(
      service.create(
        {
          patient_id: 7,
          quoted_discount: 300,
          items: [{ procedure_name: 'Crown', amount: 250 }],
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.quotes.create).not.toHaveBeenCalled();
  });

  it('refuses a validity date in the past', async () => {
    const { service, prisma } = build([]);
    await expect(
      service.create(
        {
          patient_id: 7,
          valid_until: '2000-01-01',
          items: [{ procedure_name: 'Crown', amount: 250 }],
        },
        ACTOR,
      ),
    ).rejects.toThrow(/valid_until/);
    expect(prisma.quotes.create).not.toHaveBeenCalled();
  });

  it('treats a null record_id like an absent one', async () => {
    const { service, prisma } = build([]);
    await service.create(
      {
        patient_id: 7,
        items: [
          {
            record_id: null as unknown as number,
            procedure_name: 'Crown',
            amount: 1,
          },
        ],
      },
      ACTOR,
    );
    expect(prisma.patient_records.count).not.toHaveBeenCalled();
    const items = (
      createdData(prisma) as {
        items: { create: { record_id: bigint | null }[] };
      }
    ).items.create;
    expect(items[0].record_id).toBeNull();
  });

  it('refuses a line that prices a record not planned for this patient', async () => {
    const { service, prisma } = build([]);
    prisma.patient_records.count.mockResolvedValue(0);
    await expect(
      service.create(
        {
          patient_id: 7,
          items: [{ record_id: 999, procedure_name: 'Crown', amount: 1 }],
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only a draft can be edited', async () => {
    const { service } = build([quote({ status: 'sent' })]);
    await expect(service.update(1n, { notes: 'x' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('replacing the lines of a draft rewrites them and the total, keeping the discount', async () => {
    const { service, tx } = build([quote({ quoted_discount: 10 })]);
    await service.update(1n, {
      items: [
        { procedure_name: 'Filling', amount: 80 },
        { procedure_name: 'X-Ray', amount: 20 },
      ],
    });
    expect(tx.quote_items.deleteMany).toHaveBeenCalledWith({
      where: { quote_id: 1n },
    });
    expect(tx.quote_items.createMany).toHaveBeenCalledTimes(1);
    expect(tx.quotes.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoted_discount: 10,
          quoted_total: 90,
        }),
      }),
    );
  });

  it('changing only the discount re-derives the total from the existing lines', async () => {
    const { service, tx } = build([quote({})]);
    await service.update(1n, { quoted_discount: 50 });
    expect(tx.quote_items.deleteMany).not.toHaveBeenCalled();
    expect(tx.quotes.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quoted_discount: 50,
          quoted_total: 200,
        }),
      }),
    );
  });
});

describe('QuotesService: deciding a quote', () => {
  it('accepting writes the quoted prices onto the unbilled records and closes competing quotes', async () => {
    const earlier = quote({ id: 1n, status: 'sent' });
    const revised = quote({
      id: 2n,
      version: 2,
      supersedes_id: 1n,
      status: 'sent',
      sent_at: new Date('2026-10-01T10:00:00Z'),
    });
    const { service, tx, audit } = build([earlier, revised]);
    const result = (await service.accept(2n, ACTOR)) as unknown as {
      status: string;
      sent_at: Date;
    };
    expect(result.status).toBe('accepted');
    expect(result.sent_at).toEqual(revised.sent_at);
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500n, invoice_id: null },
        data: expect.objectContaining({ quoted_amount: 250 }),
      }),
    );
    // Every other open quote of this patient that is a version of this one or
    // prices the same records is closed: version 1 by chain, siblings by record.
    const closing = tx.quotes.updateMany.mock.calls[0][0] as {
      where: {
        patient_id: bigint;
        id: { not: bigint };
        status: { in: string[] };
        OR: object[];
      };
      data: { status: string };
    };
    expect(closing.data.status).toBe('expired');
    expect(closing.where.patient_id).toBe(7n);
    expect(closing.where.id).toEqual({ not: 2n });
    expect(closing.where.status).toEqual({ in: ['sent', 'accepted'] });
    expect(closing.where.OR).toEqual(
      expect.arrayContaining([
        { id: 1n },
        { items: { some: { record_id: { in: [500n] } } } },
      ]),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.quote.accept' }),
    );
  });

  it('accepting a draft (agreed in person) stamps it as sent too', async () => {
    const { service } = build([quote({ status: 'draft' })]);
    const result = (await service.accept(1n, ACTOR)) as unknown as {
      sent_at: Date | null;
    };
    expect(result.sent_at).toBeInstanceOf(Date);
  });

  it('refuses to accept a quote whose work was billed in the meantime', async () => {
    const { service, tx } = build(
      [quote({ status: 'sent' })],
      [
        {
          title: 'Crown',
          tooth_number: '16',
          invoice: { invoice_number: 'INV-2026-00003' },
        },
      ],
    );
    await expect(service.accept(1n, ACTOR)).rejects.toThrow(
      /Crown on tooth 16 \(INV-2026-00003\)/,
    );
    expect(tx.patient_records.updateMany).not.toHaveBeenCalled();
    expect(tx.quotes.update).not.toHaveBeenCalled();
  });

  it('cannot accept a declined or expired quote', async () => {
    const { service } = build([quote({ status: 'declined' })]);
    await expect(service.accept(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('revising a sent quote creates a draft of the next version pointing back at it, discount included', async () => {
    const { service, prisma } = build([
      quote({ status: 'sent', version: 3, quoted_discount: 25 }),
    ]);
    await service.revise(1n, ACTOR);
    const data = createdData(prisma);
    expect(data).toMatchObject({
      version: 4,
      supersedes_id: 1n,
      status: 'draft',
      quoted_discount: 25,
    });
    expect((data.items as { create: unknown[] }).create).toHaveLength(1);
  });

  it('refuses a second open revision of the same quote', async () => {
    const { service, prisma } = build([quote({ status: 'sent' })]);
    prisma.quotes.findFirst.mockResolvedValue({
      id: 9n,
      version: 2,
      quote_number: 'QUO-2026-00009',
    });
    await expect(service.revise(1n, ACTOR)).rejects.toThrow(/QUO-2026-00009/);
    expect(prisma.quotes.create).not.toHaveBeenCalled();
  });

  it('a draft cannot be revised (edit it instead) and only a draft can be deleted', async () => {
    const draft = build([quote({ status: 'draft' })]);
    await expect(draft.service.revise(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const sent = build([quote({ status: 'sent' })]);
    await expect(sent.service.remove(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(sent.prisma.quotes.delete).not.toHaveBeenCalled();
  });

  it('expires overdue sent quotes before a list and before any status decision', async () => {
    const { service, prisma } = build([quote({ status: 'draft' })]);
    await service.findAll({});
    await service.send(1n);
    expect(prisma.quotes.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.quotes.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'sent',
          valid_until: { lt: expect.any(Date) },
        }),
        data: expect.objectContaining({ status: 'expired' }),
      }),
    );
  });
});

describe('QuotesService.createInvoice (billing an accepted quote as it stands)', () => {
  const accepted = () =>
    quote({
      status: 'accepted',
      quoted_discount: 50,
      quoted_total: 220,
      notes: 'Two visits',
      items: [
        {
          record_id: 500n,
          procedure_name: 'Crown',
          tooth_number: '16',
          description: null,
          quoted_amount: 250,
        },
        {
          record_id: null,
          procedure_name: 'X-Ray',
          tooth_number: null,
          description: null,
          quoted_amount: 20,
        },
      ],
    });

  it('issues one invoice with the lines, the discount and the quote link, and attaches the planned records', async () => {
    const { service, prisma, tx, audit } = build([accepted()]);
    const invoice = (await service.createInvoice(
      1n,
      { procedure_date: '2026-10-20', due_date: '2026-11-20' },
      ACTOR,
    )) as unknown as { invoice_number: string };
    expect(invoice.invoice_number).toBe('INV-2026-00077');
    const data = prisma.treatment_invoices.create.mock.calls[0][0].data as {
      quote_id: bigint;
      subtotal: number;
      discount_amount: number;
      discount_reason: string;
      total_amount: number;
      remaining_amount: number;
      status: string;
      created_by: bigint;
      notes: string;
      due_date: Date;
      procedure_date: Date;
      line_items: { create: { procedure_name: string; amount: number }[] };
    };
    expect(data).toMatchObject({
      quote_id: 1n,
      subtotal: 270,
      discount_amount: 50,
      discount_reason: 'Agreed on quote QUO-2026-00001',
      total_amount: 220,
      remaining_amount: 220,
      status: 'open',
      created_by: ACTOR,
      notes: 'Two visits',
    });
    expect(data.line_items.create).toEqual([
      expect.objectContaining({ procedure_name: 'Crown', amount: 250 }),
      expect.objectContaining({ procedure_name: 'X-Ray', amount: 20 }),
    ]);
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [500n] }, invoice_id: null },
        data: expect.objectContaining({ invoice_id: 77n }),
      }),
    );
    expect(data.due_date.toISOString().slice(0, 10)).toBe('2026-11-20');
    expect(data.procedure_date.toISOString().slice(0, 10)).toBe('2026-10-20');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'billing.quote.invoice' }),
    );
  });

  it('only an accepted quote can be invoiced', async () => {
    const { service, prisma } = build([quote({ status: 'sent' })]);
    await expect(service.createInvoice(1n, {}, ACTOR)).rejects.toThrow(
      /sent quote cannot be invoiced/,
    );
    expect(prisma.treatment_invoices.create).not.toHaveBeenCalled();
  });

  it('refuses a second live invoice from the same quote but ignores a cancelled one', async () => {
    const live = build([
      quote({
        ...accepted(),
        invoices: [
          { id: 5n, invoice_number: 'INV-2026-00005', status: 'open' },
        ],
      }),
    ]);
    await expect(live.service.createInvoice(1n, {}, ACTOR)).rejects.toThrow(
      /INV-2026-00005 was already issued/,
    );
    const voided = build([
      quote({
        ...accepted(),
        invoices: [
          { id: 5n, invoice_number: 'INV-2026-00005', status: 'cancelled' },
        ],
      }),
    ]);
    await voided.service.createInvoice(1n, {}, ACTOR);
    expect(voided.prisma.treatment_invoices.create).toHaveBeenCalledTimes(1);
  });

  it('refuses when the chart already billed some of the quoted work', async () => {
    const { service, prisma } = build(
      [accepted()],
      [
        {
          title: 'Crown',
          tooth_number: '16',
          invoice: { invoice_number: 'INV-2026-00009' },
        },
      ],
    );
    await expect(service.createInvoice(1n, {}, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.treatment_invoices.create).not.toHaveBeenCalled();
  });

  it('rolls back when the chart billed a quoted record between the check and the write', async () => {
    const { service, tx } = build([accepted()]);
    tx.patient_records.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createInvoice(1n, {}, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.treatment_invoices.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

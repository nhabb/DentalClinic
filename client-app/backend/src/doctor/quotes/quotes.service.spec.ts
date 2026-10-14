import { BadRequestException, ConflictException } from '@nestjs/common';
import { QuotesService } from './quotes.service';

type Quote = {
  id: bigint;
  patient_id: bigint;
  branch_id: bigint | null;
  version: number;
  supersedes_id: bigint | null;
  status: string;
  valid_until: Date | null;
  notes: string | null;
  quoted_total: number;
  items: {
    record_id: bigint | null;
    procedure_name: string;
    tooth_number: string | null;
    description: string | null;
    quoted_amount: number;
  }[];
};

/** A fake database holding a few quotes; writes are recorded, not applied. */
function build(quotes: Quote[]) {
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
    },
    quote_items: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    patient_records: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    patient_records: { count: jest.fn().mockResolvedValue(1) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new QuotesService(prisma as never, audit as never);
  return { service, tx, prisma, audit };
}

const quote = (over: Partial<Quote>): Quote => ({
  id: 1n,
  patient_id: 7n,
  branch_id: null,
  version: 1,
  supersedes_id: null,
  status: 'draft',
  valid_until: null,
  notes: null,
  quoted_total: 250,
  items: [
    {
      record_id: 500n,
      procedure_name: 'Crown',
      tooth_number: '16',
      description: null,
      quoted_amount: 250,
    },
  ],
  ...over,
});

const ACTOR = 21n;

describe('QuotesService lifecycle', () => {
  it('creates a draft, version 1, with the lines and their sum', async () => {
    const { service, prisma } = build([]);
    await service.create(
      {
        patient_id: 7,
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
    const data = prisma.quotes.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      patient_id: 7n,
      version: 1,
      status: 'draft',
      quoted_total: 270.5,
      created_by: ACTOR,
    });
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
      prisma.quotes.create.mock.calls[0][0].data as {
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

  it('replacing the lines of a draft rewrites them and the total', async () => {
    const { service, tx } = build([quote({})]);
    await service.update(1n, {
      items: [{ procedure_name: 'Filling', amount: 80 }],
    });
    expect(tx.quote_items.deleteMany).toHaveBeenCalledWith({
      where: { quote_id: 1n },
    });
    expect(tx.quote_items.createMany).toHaveBeenCalled();
    const data = tx.quotes.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.quoted_total).toBe(80);
  });

  it('accepting writes the quoted prices onto the planned records and closes competing quotes', async () => {
    const earlier = quote({ id: 1n, status: 'sent' });
    const revised = quote({
      id: 2n,
      version: 2,
      supersedes_id: 1n,
      status: 'sent',
    });
    const { service, tx, audit } = build([earlier, revised]);
    const result = (await service.accept(2n, ACTOR)) as unknown as {
      status: string;
    };
    expect(result.status).toBe('accepted');
    expect(tx.patient_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500n, record_type: 'treatment_plan' },
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

  it('cannot accept a declined or expired quote', async () => {
    const { service } = build([quote({ status: 'declined' })]);
    await expect(service.accept(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('revising a sent quote creates a draft of the next version pointing back at it', async () => {
    const { service, prisma } = build([quote({ status: 'sent', version: 3 })]);
    await service.revise(1n, ACTOR);
    const data = prisma.quotes.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      version: 4,
      supersedes_id: 1n,
      status: 'draft',
    });
    expect((data.items as { create: unknown[] }).create).toHaveLength(1);
  });

  it('refuses a second open revision of the same quote', async () => {
    const { service, prisma } = build([quote({ status: 'sent' })]);
    prisma.quotes.findFirst.mockResolvedValue({ id: 9n, version: 2 });
    await expect(service.revise(1n, ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
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
        where: expect.objectContaining({ status: 'sent' }),
        data: expect.objectContaining({ status: 'expired' }),
      }),
    );
  });
});

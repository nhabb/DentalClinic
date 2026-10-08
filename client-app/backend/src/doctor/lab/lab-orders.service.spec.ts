import { BadRequestException } from '@nestjs/common';
import {
  LabOrdersService,
  overdueWhere,
  stampedDates,
} from './lab-orders.service';

function build(current: Record<string, unknown>) {
  const prisma = {
    lab_orders: {
      findUnique: jest.fn().mockResolvedValue(current),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...current, ...args.data }),
      ),
    },
  };
  const caseLinks = { assertValid: jest.fn().mockResolvedValue(undefined) };
  const labs = { assertActive: jest.fn().mockResolvedValue(undefined) };
  const service = new LabOrdersService(
    prisma as never,
    caseLinks as never,
    labs as never,
  );
  return { service, prisma, caseLinks, labs };
}

const ordered = {
  id: 5n,
  patient_id: 31n,
  appointment_id: null,
  record_id: null,
  status: 'ordered',
  sent_at: null,
  received_at: null,
  fitted_at: null,
};

describe('LabOrdersService.update', () => {
  it('stamps today when the order moves to sent without a date', async () => {
    const { service, prisma } = build(ordered);
    await service.update(5n, { status: 'sent' });
    const data = prisma.lab_orders.update.mock.calls[0][0].data as unknown as {
      status: string;
      sent_at: Date;
    };
    expect(data.status).toBe('sent');
    expect(data.sent_at).toBeInstanceOf(Date);
  });

  it('keeps the date the caller gave', async () => {
    const { service, prisma } = build(ordered);
    await service.update(5n, { status: 'received', received_at: '2026-10-01' });
    const data = prisma.lab_orders.update.mock.calls[0][0].data as unknown as {
      received_at: Date;
    };
    expect(data.received_at.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('refuses to change the status of a fitted or cancelled order', async () => {
    const { service } = build({ ...ordered, status: 'fitted' });
    await expect(service.update(5n, { status: 'sent' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.update(5n, { notes: 'still editable' }),
    ).resolves.toBeDefined();
  });

  it('re-checks patient, appointment and record when any of them changes', async () => {
    const { service, caseLinks } = build(ordered);
    await service.update(5n, { appointment_id: 44 });
    expect(caseLinks.assertValid).toHaveBeenCalledWith({
      patient_id: 31,
      appointment_id: 44,
      record_id: null,
    });
  });

  it('does not re-check links for an unrelated change', async () => {
    const { service, caseLinks, labs } = build(ordered);
    await service.update(5n, { shade: 'A3', lab_id: 2 });
    expect(caseLinks.assertValid).not.toHaveBeenCalled();
    expect(labs.assertActive).toHaveBeenCalledWith(2n);
  });
});

describe('lab order helpers', () => {
  it('overdue means still at the lab and past the due date', () => {
    const where = overdueWhere();
    expect(where.status).toEqual({ in: ['ordered', 'sent'] });
    expect(where.due_at.lt).toBeInstanceOf(Date);
  });

  it('stampedDates only fills the date of the status being entered', () => {
    expect(Object.keys(stampedDates('ordered', {}))).toEqual([]);
    expect(Object.keys(stampedDates('fitted', {}))).toEqual(['fitted_at']);
    expect(
      stampedDates('sent', { sent_at: '2026-09-30' }).sent_at?.toISOString(),
    ).toBe('2026-09-30T12:00:00.000Z');
  });
});

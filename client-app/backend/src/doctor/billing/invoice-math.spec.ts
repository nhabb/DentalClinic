import { BadRequestException } from '@nestjs/common';
import {
  daysOverdue,
  deriveInvoiceStatus,
  dueDateFor,
  invoiceFigures,
  paymentDateFor,
} from './invoice-math';
import { clinicTodayIso } from '../../shared/common/date-only';

const day = (d: Date) => d.toISOString().slice(0, 10);

describe('invoiceFigures', () => {
  it('adds the lines to a subtotal and owes the subtotal minus the discount', () => {
    expect(invoiceFigures([100, 50.25, 0.1], 20, 'Loyal patient')).toEqual({
      subtotal: 150.35,
      discount_amount: 20,
      discount_reason: 'Loyal patient',
      total_amount: 130.35,
      amount_paid: 0,
      remaining_amount: 130.35,
      status: 'open',
    });
  });

  it('settles an invoice that comes to nothing from the start', () => {
    expect(invoiceFigures([0]).status).toBe('paid');
    expect(invoiceFigures([100], 100, 'Goodwill').status).toBe('paid');
  });

  it('drops a reason that goes with no discount', () => {
    expect(invoiceFigures([100], 0, 'ignored').discount_reason).toBeNull();
  });

  it('refuses a discount above the lines, below zero, or without a reason', () => {
    expect(() => invoiceFigures([100], 100.01, 'x')).toThrow(
      BadRequestException,
    );
    expect(() => invoiceFigures([100], -1, 'x')).toThrow(BadRequestException);
    expect(() => invoiceFigures([100], 10)).toThrow(/needs a reason/);
    expect(() => invoiceFigures([100], 10, '   ')).toThrow(/needs a reason/);
  });
});

describe('dueDateFor', () => {
  const work = new Date('2026-10-10T12:00:00.000Z');

  it('is the day of the work unless terms say otherwise', () => {
    expect(dueDateFor(work)).toBe(work);
    expect(day(dueDateFor(work, '2026-11-10'))).toBe('2026-11-10');
    expect(day(dueDateFor(work, '2026-10-10'))).toBe('2026-10-10');
  });

  it('never falls before the work', () => {
    expect(() => dueDateFor(work, '2026-10-09')).toThrow(BadRequestException);
  });
});

describe('paymentDateFor', () => {
  it('defaults to the clinic calendar today and accepts an earlier day', () => {
    const today = clinicTodayIso();
    expect(day(paymentDateFor())).toBe(today);
    expect(day(paymentDateFor('2026-01-05'))).toBe('2026-01-05');
    expect(day(paymentDateFor('2026-01-05T15:00:00Z'))).toBe('2026-01-05');
  });

  it('refuses a day in the future', () => {
    const nextWeek = new Date(Date.now() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(() => paymentDateFor(nextWeek)).toThrow(/future/);
  });
});

describe('daysOverdue', () => {
  const now = new Date('2026-10-15T09:30:00.000Z');

  it('is zero until the due date has passed, then counts whole days', () => {
    expect(daysOverdue(new Date('2026-10-20T12:00:00Z'), now)).toBe(0);
    expect(daysOverdue(new Date('2026-10-15T00:00:00Z'), now)).toBe(0);
    expect(daysOverdue(new Date('2026-10-14T12:00:00Z'), now)).toBe(1);
    expect(daysOverdue(new Date('2026-07-07T00:00:00Z'), now)).toBe(100);
  });
});

describe('deriveInvoiceStatus', () => {
  it('maps paid-so-far to open, partial or paid', () => {
    expect(deriveInvoiceStatus(100, 0)).toBe('open');
    expect(deriveInvoiceStatus(100, 40)).toBe('partial');
    expect(deriveInvoiceStatus(100, 100)).toBe('paid');
    expect(deriveInvoiceStatus(0, 0)).toBe('paid');
  });
});

import { type Coverage, withCoverage } from './result-coverage';

/** The coverage a list result was given (fails loudly when none). */
const coverageOf = (v: unknown): Coverage => {
  const c = (withCoverage(v) as { coverage?: Coverage }).coverage;
  if (!c) throw new Error('no coverage attached');
  return c;
};

describe('withCoverage', () => {
  it('marks a page as partial with the total and page numbers', () => {
    const out = coverageOf({
      data: [1, 2, 3],
      meta: { total: 43, page: 1, limit: 3, totalPages: 15 },
    });
    expect(out).toMatchObject({ shown: 3, total: 43, complete: false });
    expect(out.note).toContain('showing 3 of 43 (page 1 of 15)');
    expect(out.note).toMatch(/^PARTIAL RESULT/);
    expect(out.note).toContain('offer to show the rest');
  });

  it('marks a page that holds every row as complete', () => {
    const out = coverageOf({
      data: [1, 2],
      meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });
    expect(out).toEqual({
      shown: 2,
      total: 2,
      complete: true,
      note: 'COMPLETE: all 2 matching rows are included.',
    });
  });

  it('reads a bare total next to data (low-stock shape)', () => {
    expect(coverageOf({ data: [1, 2, 3], total: 3 }).complete).toBe(true);
    expect(coverageOf({ data: [1], total: 9 })).toMatchObject({
      shown: 1,
      total: 9,
      complete: false,
    });
  });

  it('treats data without any total as complete', () => {
    expect(coverageOf({ data: [1, 2, 3] })).toMatchObject({
      shown: 3,
      total: 3,
      complete: true,
    });
  });

  it('marks a truncated SQL result as partial with an unknown total', () => {
    const out = coverageOf({ rows: [1, 2], truncated: true });
    expect(out).toMatchObject({
      shown: 2,
      total: null,
      complete: false,
    });
    expect(out.note).toContain('total is unknown');
  });

  it('marks an untruncated SQL result as complete', () => {
    expect(coverageOf({ rows: [1, 2], truncated: false })).toEqual({
      shown: 2,
      total: 2,
      complete: true,
      note: 'COMPLETE: all 2 matching rows are included.',
    });
  });

  it('leaves single objects, arrays and primitives untouched', () => {
    const invoice = { id: 1, total_amount: '10' };
    expect(withCoverage(invoice)).toBe(invoice);
    const list = [1, 2];
    expect(withCoverage(list)).toBe(list);
    expect(withCoverage('ok')).toBe('ok');
    expect(withCoverage(null)).toBeNull();
  });
});

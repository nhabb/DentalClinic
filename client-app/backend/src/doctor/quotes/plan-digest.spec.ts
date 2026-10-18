import { agreementIsStale, planDigest, type AgreeableLine } from './plan-digest';

/*
 * The rule this pins: a fingerprint covers the deal, never the progress.
 *
 * Get that wrong in either direction and the feature is worse than nothing —
 * too loose and the desk is told a changed plan is still agreed, too tight
 * and finishing a filling demands a fresh signature.
 */

const line = (over: Partial<AgreeableLine> = {}): AgreeableLine => ({
  record_id: 1n,
  procedure: 'Crown',
  tooth: '11',
  amount: 250,
  ...over,
});

const BASE = [line(), line({ record_id: 2n, procedure: 'Filling', tooth: '16', amount: 120 })];

describe('planDigest: what counts as a change to the deal', () => {
  it('is the same for the same plan read twice', () => {
    expect(planDigest(BASE)).toBe(planDigest(BASE));
  });

  it('does not depend on the order the rows came back in', () => {
    expect(planDigest([...BASE].reverse())).toBe(planDigest(BASE));
  });

  it('reads 250 and 250.00 as the same price', () => {
    expect(planDigest([line({ amount: 250.0 })])).toBe(planDigest([line({ amount: 250 })]));
  });

  it('changes when work is added', () => {
    expect(planDigest([...BASE, line({ record_id: 3n, procedure: 'Implant', amount: 800 })]))
      .not.toBe(planDigest(BASE));
  });

  it('changes when work is dropped', () => {
    expect(planDigest([BASE[0]])).not.toBe(planDigest(BASE));
  });

  it('changes when a line is repriced', () => {
    expect(planDigest([line({ amount: 400 }), BASE[1]])).not.toBe(planDigest(BASE));
  });

  it('changes when a line is priced for the first time', () => {
    const unpriced = [line({ amount: null }), BASE[1]];
    expect(planDigest(unpriced)).not.toBe(planDigest(BASE));
  });

  it('changes when the procedure or the tooth changes', () => {
    expect(planDigest([line({ procedure: 'Bridge' }), BASE[1]])).not.toBe(planDigest(BASE));
    expect(planDigest([line({ tooth: '21' }), BASE[1]])).not.toBe(planDigest(BASE));
  });
});

describe('agreementIsStale', () => {
  const current = planDigest(BASE);

  it('is false while the plan is the one they agreed to', () => {
    expect(agreementIsStale(new Date(), current, current)).toBe(false);
  });

  it('is true once the plan has moved on', () => {
    const grown = planDigest([...BASE, line({ record_id: 9n, amount: 800 })]);
    expect(agreementIsStale(new Date(), current, grown)).toBe(true);
  });

  it('is false when nobody has agreed yet: there is nothing to go stale', () => {
    expect(agreementIsStale(null, null, current)).toBe(false);
    expect(agreementIsStale(null, 'whatever', current)).toBe(false);
  });

  it('is false for an agreement older than the fingerprint', () => {
    // Nothing to compare against. Better than nagging about a change nobody
    // can show; the next agreement taken writes one.
    expect(agreementIsStale(new Date(), null, current)).toBe(false);
  });
});

import { createHash } from 'node:crypto';

/**
 * A fingerprint of what the patient is being asked to agree to.
 *
 * `accepted_at` on its own says only that somebody once agreed. A plan is
 * editable all the way through treatment — that is the point of it — so a
 * plan accepted in October can have grown by November, and a screen still
 * showing "Agreed 17 Oct" is describing a plan that no longer exists. The
 * digest is stored when the agreement is taken; when it stops matching the
 * plan, the agreement is stale and has to be taken again.
 *
 * **What is in it is the deal, not the progress.** The procedure, the tooth
 * and the price are what a patient agrees to. Completing work, billing it or
 * paying for it changes a line's state and its dates but changes nothing they
 * agreed to, so none of that is in here — otherwise finishing a filling would
 * demand a fresh signature.
 *
 * A line with no price is part of the fingerprint as an unpriced line: giving
 * it a price afterwards is a change to the deal and should be re-agreed.
 */
export interface AgreeableLine {
  record_id: bigint | number | string;
  procedure: string;
  tooth: string | null;
  amount: number | null;
}

/** Stable across row order, so re-reading the plan cannot change the answer. */
export function planDigest(lines: AgreeableLine[]): string {
  const shape = lines
    .map((l) => ({
      id: String(l.record_id),
      procedure: l.procedure ?? '',
      tooth: l.tooth ?? null,
      // Fixed to 2 places so 250 and 250.00 are the same deal.
      amount: l.amount === null || l.amount === undefined ? null : l.amount.toFixed(2),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}

/**
 * Is the agreement we hold still for the plan as it stands?
 *
 * A plan accepted before the digest existed has nothing to compare against.
 * It is reported as not stale rather than nagging about a change we cannot
 * actually show: the next agreement taken writes a digest and the question
 * becomes answerable from then on.
 */
export function agreementIsStale(
  acceptedAt: Date | null,
  acceptedDigest: string | null,
  currentDigest: string,
): boolean {
  if (!acceptedAt || !acceptedDigest) return false;
  return acceptedDigest !== currentDigest;
}

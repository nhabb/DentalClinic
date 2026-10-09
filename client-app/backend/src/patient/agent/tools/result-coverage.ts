/**
 * Tells the model how much of a list it is looking at.
 *
 * List tools page their results (10 or 20 rows by default) and the SQL tool
 * caps rows, so a result is often a slice of a larger set. Left implicit, the
 * model presents the slice as the whole answer ("here are the items that are
 * low in stock" with 10 of 43). Every list result therefore carries a
 * `coverage` field: how many rows are shown, how many exist, and a sentence
 * the model is told to act on (agent-prompt.ts, "Completeness").
 */

export interface Coverage {
  shown: number;
  /** Rows that matched in total; null when only "more than shown" is known. */
  total: number | null;
  complete: boolean;
  note: string;
}

interface Paged {
  data: unknown[];
  meta?: { total?: number; page?: number; totalPages?: number };
  total?: number;
}

interface SqlResult {
  rows: unknown[];
  truncated?: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isPaged = (v: unknown): v is Paged =>
  isRecord(v) && Array.isArray(v.data);

const isSqlResult = (v: unknown): v is SqlResult =>
  isRecord(v) && Array.isArray(v.rows);

/** Add `coverage` to a list result; anything else is returned untouched. */
export function withCoverage(result: unknown): unknown {
  if (isPaged(result)) {
    const shown = result.data.length;
    const total = result.meta?.total ?? result.total ?? shown;
    const coverage = pagedCoverage(
      shown,
      total,
      result.meta?.page,
      result.meta?.totalPages,
    );
    return { ...result, coverage };
  }
  if (isSqlResult(result)) {
    const shown = result.rows.length;
    const coverage: Coverage = result.truncated
      ? {
          shown,
          total: null,
          complete: false,
          note: `PARTIAL RESULT: only the first ${shown} rows are shown; more matched and the total is unknown. Say so explicitly; narrow the query or run a COUNT to give a number.`,
        }
      : complete(shown);
    return { ...result, coverage };
  }
  return result;
}

function pagedCoverage(
  shown: number,
  total: number,
  page?: number,
  totalPages?: number,
): Coverage {
  if (shown >= total) return complete(total);
  const where =
    page !== undefined && totalPages !== undefined
      ? ` (page ${page} of ${totalPages})`
      : '';
  return {
    shown,
    total,
    complete: false,
    note: `PARTIAL RESULT: showing ${shown} of ${total}${where}. Tell the user only ${shown} of ${total} are listed, give the total, and offer to show the rest (next page or a higher limit).`,
  };
}

const complete = (total: number): Coverage => ({
  shown: total,
  total,
  complete: true,
  note: `COMPLETE: all ${total} matching rows are included.`,
});

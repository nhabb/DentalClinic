/**
 * Free-text search that degrades gracefully instead of returning nothing.
 *
 * A search runs in tiers, strictest first, and the first tier that finds rows
 * wins. "Fatima Nasser" against a patient stored as "Fatima Nassser" (typo)
 * fails the exact tier (last name must contain "Nasser") but succeeds on the
 * any-word tier ("Fatima" matches), so the caller still gets her back and can
 * see from `searchTier` that the match was loose.
 *
 * Every `where` fragment is a plain Prisma filter object built from column
 * names, so one helper serves patients (first/last name), inventory (name/sku)
 * and labs (name) alike.
 */

export type SearchTier = 'exact' | 'all-words' | 'any-word';

export interface TieredWhere {
  tier: SearchTier;
  where: Record<string, unknown>;
}

export interface SearchResult<R> {
  rows: R[];
  total: number;
  /** Which tier produced the rows, or null when there was no search term. */
  searchTier: SearchTier | null;
}

/** The words of a query, trimmed; an empty array for a blank query. */
export const searchWords = (search: string | undefined): string[] =>
  (search ?? '').trim().split(/\s+/).filter(Boolean);

const contains = (value: string) => ({
  contains: value,
  mode: 'insensitive' as const,
});

/** `field contains text` for any of the fields. */
const anyField = (fields: readonly string[], text: string) => ({
  OR: fields.map((f) => ({ [f]: contains(text) })),
});

/**
 * Tiers for plain text columns such as an item name and sku:
 *   exact      the whole phrase appears in one field
 *   all-words  every word appears somewhere (any field each)
 *   any-word   at least one word appears somewhere
 * One-word searches have a single tier (all three would be identical).
 */
export function textSearchTiers(
  search: string | undefined,
  fields: readonly string[],
): TieredWhere[] {
  const words = searchWords(search);
  if (words.length === 0) return [];
  const tiers: TieredWhere[] = [
    { tier: 'exact', where: anyField(fields, words.join(' ')) },
  ];
  if (words.length > 1) {
    tiers.push({
      tier: 'all-words',
      where: { AND: words.map((w) => anyField(fields, w)) },
    });
    tiers.push({
      tier: 'any-word',
      where: { OR: words.map((w) => anyField(fields, w)) },
    });
  }
  return tiers;
}

export interface PersonFields {
  first: string;
  last: string;
  /** Columns matched whole (email, phone…). */
  extra?: readonly string[];
}

/**
 * Tiers for a person's name held in two columns:
 *   exact     "first last" (or "last first") maps onto the two columns, or an
 *             extra column contains one of the words
 *   any-word  any word appears in the first name, last name or an extra column
 * One-word searches have a single tier: the word in any column.
 */
export function personSearchTiers(
  search: string | undefined,
  { first, last, extra = [] }: PersonFields,
): TieredWhere[] {
  const words = searchWords(search);
  if (words.length === 0) return [];
  const all = [first, last, ...extra];
  if (words.length === 1) {
    return [{ tier: 'exact', where: anyField(all, words[0]) }];
  }
  const split = (firstPart: string[], lastPart: string[]) => ({
    AND: [
      { [first]: contains(firstPart.join(' ')) },
      { [last]: contains(lastPart.join(' ')) },
    ],
  });
  return [
    {
      tier: 'exact',
      where: {
        OR: [
          split(words.slice(0, 1), words.slice(1)),
          split(words.slice(-1), words.slice(0, -1)),
          ...words.flatMap((w) => extra.map((f) => ({ [f]: contains(w) }))),
        ],
      },
    },
    {
      tier: 'any-word',
      where: { OR: words.map((w) => anyField(all, w)) },
    },
  ];
}

/**
 * Run `query` tier by tier until one returns rows. With no tiers (blank
 * search) the query runs once unfiltered. The last tier's result is returned
 * even when empty, so "nothing found" still carries a total of 0.
 */
export async function searchWithFallback<R>(
  tiers: readonly TieredWhere[],
  query: (
    where: Record<string, unknown> | undefined,
  ) => Promise<{ rows: R[]; total: number }>,
): Promise<SearchResult<R>> {
  if (tiers.length === 0) {
    return { ...(await query(undefined)), searchTier: null };
  }
  let last: SearchResult<R> | undefined;
  for (const { tier, where } of tiers) {
    const result = await query(where);
    last = { ...result, searchTier: tier };
    if (result.total > 0) break;
  }
  return last!;
}

import {
  personSearchTiers,
  searchWithFallback,
  searchWords,
  textSearchTiers,
  type TieredWhere,
} from './text-search';

const ci = (value: string) => ({ contains: value, mode: 'insensitive' });

describe('searchWords', () => {
  it('splits on any whitespace and drops blanks', () => {
    expect(searchWords('  Fatima   Nasser ')).toEqual(['Fatima', 'Nasser']);
    expect(searchWords('')).toEqual([]);
    expect(searchWords(undefined)).toEqual([]);
  });
});

describe('textSearchTiers', () => {
  it('is empty for a blank search', () => {
    expect(textSearchTiers('   ', ['name'])).toEqual([]);
  });

  it('has one tier for a single word', () => {
    expect(textSearchTiers('gloves', ['name', 'sku'])).toEqual([
      {
        tier: 'exact',
        where: { OR: [{ name: ci('gloves') }, { sku: ci('gloves') }] },
      },
    ]);
  });

  it('adds all-words and any-word tiers for a phrase', () => {
    const tiers = textSearchTiers('latex gloves', ['name']);
    expect(tiers.map((t) => t.tier)).toEqual([
      'exact',
      'all-words',
      'any-word',
    ]);
    expect(tiers[0].where).toEqual({ OR: [{ name: ci('latex gloves') }] });
    expect(tiers[1].where).toEqual({
      AND: [{ OR: [{ name: ci('latex') }] }, { OR: [{ name: ci('gloves') }] }],
    });
    expect(tiers[2].where).toEqual({
      OR: [{ OR: [{ name: ci('latex') }] }, { OR: [{ name: ci('gloves') }] }],
    });
  });
});

describe('personSearchTiers', () => {
  const fields = { first: 'first_name', last: 'last_name', extra: ['email'] };

  it('matches one word against every column', () => {
    expect(personSearchTiers('fatima', fields)).toEqual([
      {
        tier: 'exact',
        where: {
          OR: [
            { first_name: ci('fatima') },
            { last_name: ci('fatima') },
            { email: ci('fatima') },
          ],
        },
      },
    ]);
  });

  it('maps "first last" and "last first" onto the columns, then falls back to any word', () => {
    const [exact, loose] = personSearchTiers('Fatima Nasser', fields);
    expect(exact.tier).toBe('exact');
    expect(exact.where).toEqual({
      OR: [
        { AND: [{ first_name: ci('Fatima') }, { last_name: ci('Nasser') }] },
        { AND: [{ first_name: ci('Nasser') }, { last_name: ci('Fatima') }] },
        { email: ci('Fatima') },
        { email: ci('Nasser') },
      ],
    });
    expect(loose.tier).toBe('any-word');
    expect(loose.where).toEqual({
      OR: [
        {
          OR: [
            { first_name: ci('Fatima') },
            { last_name: ci('Fatima') },
            { email: ci('Fatima') },
          ],
        },
        {
          OR: [
            { first_name: ci('Nasser') },
            { last_name: ci('Nasser') },
            { email: ci('Nasser') },
          ],
        },
      ],
    });
  });

  it('keeps multi-word surnames together in the exact tier', () => {
    const [exact] = personSearchTiers('Ali Abou Nader', fields);
    const { OR } = exact.where as { OR: unknown[] };
    expect(OR.slice(0, 2)).toEqual([
      { AND: [{ first_name: ci('Ali') }, { last_name: ci('Abou Nader') }] },
      { AND: [{ first_name: ci('Nader') }, { last_name: ci('Ali Abou') }] },
    ]);
  });
});

describe('searchWithFallback', () => {
  const tiers: TieredWhere[] = [
    { tier: 'exact', where: { a: 1 } },
    { tier: 'any-word', where: { b: 2 } },
  ];

  it('runs unfiltered once when there is no search', async () => {
    const query = jest.fn().mockResolvedValue({ rows: ['x'], total: 1 });
    const result = await searchWithFallback([], query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({ rows: ['x'], total: 1, searchTier: null });
  });

  it('stops at the first tier that finds rows', async () => {
    const query = jest.fn().mockResolvedValue({ rows: ['hit'], total: 1 });
    const result = await searchWithFallback(tiers, query);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ a: 1 });
    expect(result.searchTier).toBe('exact');
  });

  it('falls through to the looser tier when the exact one is empty', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [], total: 0 })
      .mockResolvedValueOnce({ rows: ['typo match'], total: 1 });
    const result = await searchWithFallback(tiers, query);
    expect(query).toHaveBeenNthCalledWith(2, { b: 2 });
    expect(result).toEqual({
      rows: ['typo match'],
      total: 1,
      searchTier: 'any-word',
    });
  });

  it('returns the last tier with total 0 when nothing matches anywhere', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], total: 0 });
    const result = await searchWithFallback(tiers, query);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ rows: [], total: 0, searchTier: 'any-word' });
  });
});

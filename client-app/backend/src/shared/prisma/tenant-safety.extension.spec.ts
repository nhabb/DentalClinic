import {
  AllOperationsParams,
  flattenCompoundUnique,
  shouldRewriteToFindFirst,
  tenantSafetyExtension,
} from './tenant-safety.extension';

describe('flattenCompoundUnique', () => {
  it('leaves plain unique selectors alone', () => {
    expect(flattenCompoundUnique({ id: 5n })).toEqual({ id: 5n });
    expect(flattenCompoundUnique({ email: 'a@b.c' })).toEqual({
      email: 'a@b.c',
    });
  });

  it('spreads compound-unique selectors into their fields', () => {
    expect(
      flattenCompoundUnique({ branch_id_sku: { branch_id: 1n, sku: 'X' } }),
    ).toEqual({ branch_id: 1n, sku: 'X' });
    expect(
      flattenCompoundUnique({
        organization_id_name: { organization_id: 2n, name: 'Tyre' },
      }),
    ).toEqual({
      organization_id: 2n,
      name: 'Tyre',
    });
  });

  it('keeps relation filters and operators, which are objects but not compound keys', () => {
    const where = {
      id: 1n,
      users: { is_active: true },
      created_at: { gte: new Date(0) },
    };
    expect(flattenCompoundUnique(where)).toEqual(where);
  });

  it('passes undefined through', () => {
    expect(flattenCompoundUnique(undefined)).toBeUndefined();
  });
});

describe('shouldRewriteToFindFirst', () => {
  const base = (over: Partial<AllOperationsParams>): AllOperationsParams => ({
    model: 'users',
    operation: 'findUnique',
    args: {},
    query: jest.fn(),
    ...over,
  });

  it('rewrites findUnique and findUniqueOrThrow outside a transaction', () => {
    expect(shouldRewriteToFindFirst(base({}))).toBe(true);
    expect(
      shouldRewriteToFindFirst(base({ operation: 'findUniqueOrThrow' })),
    ).toBe(true);
  });

  it('leaves other operations alone', () => {
    for (const operation of [
      'findFirst',
      'findMany',
      'update',
      'delete',
      'upsert',
      'count',
    ]) {
      expect(shouldRewriteToFindFirst(base({ operation }))).toBe(false);
    }
  });

  it('leaves unique reads inside a transaction alone (batching is per-transaction there)', () => {
    expect(
      shouldRewriteToFindFirst(
        base({ __internalParams: { transaction: { id: 't1' } } }),
      ),
    ).toBe(false);
  });
});

describe('tenantSafetyExtension', () => {
  function setup() {
    const baseClient = {
      users: {
        findFirst: jest.fn().mockResolvedValue({ id: 1n }),
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 1n }),
      },
    };
    const ext = tenantSafetyExtension(baseClient);
    const run = (params: Partial<AllOperationsParams>) =>
      ext.query.$allModels.$allOperations({
        model: 'users',
        operation: 'findUnique',
        args: {},
        query: jest.fn(),
        ...params,
      });
    return { baseClient, run };
  }

  it('routes findUnique to the base delegate findFirst with the same args', async () => {
    const { baseClient, run } = setup();
    const query = jest.fn();
    await run({ args: { where: { id: 1n }, select: { id: true } }, query });
    expect(baseClient.users.findFirst).toHaveBeenCalledWith({
      where: { id: 1n },
      select: { id: true },
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('routes findUniqueOrThrow to findFirstOrThrow and flattens compound keys', async () => {
    const { baseClient, run } = setup();
    await run({
      operation: 'findUniqueOrThrow',
      args: { where: { branch_id_sku: { branch_id: 1n, sku: 'A' } } },
    });
    expect(baseClient.users.findFirstOrThrow).toHaveBeenCalledWith({
      where: { branch_id: 1n, sku: 'A' },
    });
  });

  it('passes everything else straight through to the original query', async () => {
    const { baseClient, run } = setup();
    const query = jest.fn().mockResolvedValue('ok');
    await expect(
      run({ operation: 'findMany', args: { take: 2 }, query }),
    ).resolves.toBe('ok');
    expect(query).toHaveBeenCalledWith({ take: 2 });
    expect(baseClient.users.findFirst).not.toHaveBeenCalled();
  });

  it('does not rewrite inside a transaction', async () => {
    const { baseClient, run } = setup();
    const query = jest.fn().mockResolvedValue('tx');
    await expect(
      run({ query, __internalParams: { transaction: {} } }),
    ).resolves.toBe('tx');
    expect(baseClient.users.findFirst).not.toHaveBeenCalled();
  });
});

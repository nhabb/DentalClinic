import { EMPTY_TENANT, runWithTenant } from './tenant-context';

/**
 * A stand-in for pg's Pool: hands out fake clients that record the SQL they
 * receive, through both the callback and the promise form of connect().
 */
class FakeClient {
  queries: { text: string; values?: unknown[] }[] = [];
  released: unknown[] = [];
  failOn: RegExp | null = null;
  query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (this.failOn?.test(text))
      return Promise.reject(new Error(`boom: ${text}`));
    return Promise.resolve({ rows: [] });
  }
  release(err?: unknown) {
    this.released.push(err);
  }
}

const fakePool = {
  clients: [] as FakeClient[],
  nextClient: null as FakeClient | null,
};

jest.mock('pg', () => ({
  Pool: class {
    connect(
      cb?: (
        err: Error | undefined,
        client: any,
        release: (e?: unknown) => void,
      ) => void,
    ) {
      const client = fakePool.nextClient ?? new FakeClient();
      fakePool.nextClient = null;
      fakePool.clients.push(client);
      if (cb) {
        cb(undefined, client, (e?: unknown) => client.release(e));
        return;
      }
      return Promise.resolve(client);
    }
  },
}));

// Import after the mock so TenantPool extends the fake.
import { TenantPool, tenantSettings } from './tenant-pool';

const settingsQuery = (client: FakeClient) =>
  client.queries.find((q) => q.text.startsWith('SELECT set_config'));
/** The values array as a name → value map, for readable assertions. */
const settingsOf = (client: FakeClient) => {
  const values = settingsQuery(client)?.values ?? [];
  const map: Record<string, unknown> = {};
  for (let i = 0; i < values.length; i += 2)
    map[String(values[i])] = values[i + 1];
  return map;
};

describe('tenantSettings', () => {
  it('maps an empty context to unset settings and bypass off', () => {
    expect(tenantSettings(EMPTY_TENANT)).toEqual({
      org: '',
      homeBranch: '',
      branchScope: '',
      bypass: 'off',
    });
  });

  it('serialises ids as text and system as bypass on', () => {
    expect(
      tenantSettings({
        ...EMPTY_TENANT,
        organizationId: 5n,
        homeBranchId: 2n,
        branchScopeId: 2n,
        system: true,
      }),
    ).toEqual({ org: '5', homeBranch: '2', branchScope: '2', bypass: 'on' });
  });
});

describe('TenantPool', () => {
  beforeEach(() => {
    fakePool.clients = [];
    fakePool.nextClient = null;
    delete process.env.DB_APP_ROLE; // default role: dental_app
  });

  it('switches role once and sets the four tenant settings on checkout (promise form)', async () => {
    const pool = new TenantPool();
    await runWithTenant(
      {
        ...EMPTY_TENANT,
        organizationId: 1n,
        homeBranchId: 2n,
        branchScopeId: 2n,
        source: 'jwt',
      },
      () => pool.connect(),
    );

    const [client] = fakePool.clients;
    expect(client.queries[0].text).toBe('SET ROLE "dental_app"');
    expect(settingsOf(client)).toEqual({
      'app.current_org': '1',
      'app.home_branch': '2',
      'app.branch_scope': '2',
      'app.bypass_rls': 'off',
    });
  });

  it('primes through the callback form used by pool.query()', (done) => {
    const pool = new TenantPool();
    runWithTenant({ ...EMPTY_TENANT, system: true, source: 'system' }, () => {
      pool.connect((err, client) => {
        expect(err).toBeUndefined();
        expect(settingsOf(client as unknown as FakeClient)).toMatchObject({
          'app.current_org': '',
          'app.bypass_rls': 'on',
        });
        done();
      });
    });
  });

  it('fails closed with empty settings when there is no tenant context', async () => {
    const pool = new TenantPool();
    await pool.connect();
    expect(settingsOf(fakePool.clients[0])).toEqual({
      'app.current_org': '',
      'app.home_branch': '',
      'app.branch_scope': '',
      'app.bypass_rls': 'off',
    });
  });

  it('re-primes a reused connection for a different tenant, without repeating SET ROLE', async () => {
    const pool = new TenantPool();
    const shared = new FakeClient();

    fakePool.nextClient = shared;
    await runWithTenant(
      { ...EMPTY_TENANT, organizationId: 1n, source: 'jwt' },
      () => pool.connect(),
    );
    fakePool.nextClient = shared;
    await runWithTenant(
      { ...EMPTY_TENANT, organizationId: 2n, source: 'jwt' },
      () => pool.connect(),
    );

    const roleQueries = shared.queries.filter((q) =>
      q.text.startsWith('SET ROLE'),
    );
    const settings = shared.queries.filter((q) =>
      q.text.startsWith('SELECT set_config'),
    );
    expect(roleQueries).toHaveLength(1);
    expect(settings.map((q) => q.values?.[1])).toEqual(['1', '2']);
  });

  it('skips set_config when the same tenant reuses the same connection', async () => {
    const pool = new TenantPool();
    const shared = new FakeClient();
    for (let i = 0; i < 2; i++) {
      fakePool.nextClient = shared;
      await runWithTenant(
        { ...EMPTY_TENANT, organizationId: 1n, source: 'jwt' },
        () => pool.connect(),
      );
    }
    expect(
      shared.queries.filter((q) => q.text.startsWith('SELECT set_config')),
    ).toHaveLength(1);
  });

  it('releases the connection with the error when priming fails', async () => {
    const pool = new TenantPool();
    const broken = new FakeClient();
    broken.failOn = /SET ROLE/;
    fakePool.nextClient = broken;

    await expect(pool.connect()).rejects.toThrow(/boom/);
    expect(broken.released).toHaveLength(1);
    expect(broken.released[0]).toBeInstanceOf(Error);
  });

  it('does not switch roles when DB_APP_ROLE is empty', async () => {
    process.env.DB_APP_ROLE = '';
    const pool = new TenantPool();
    await pool.connect();
    expect(
      fakePool.clients[0].queries.some((q) => q.text.startsWith('SET ROLE')),
    ).toBe(false);
    expect(settingsQuery(fakePool.clients[0])).toBeDefined();
  });

  it('quotes a custom role name', async () => {
    process.env.DB_APP_ROLE = 'clinic"app';
    const pool = new TenantPool();
    await pool.connect();
    expect(fakePool.clients[0].queries[0].text).toBe('SET ROLE "clinic""app"');
  });
});

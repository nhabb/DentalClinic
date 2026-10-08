import {
  MAX_ROWS,
  SessionTamperedError,
  SqlRunner,
  TransactionRunner,
  runGuardedSelect,
} from './guarded-select';

/**
 * A fake connection: settings live in a map, "set_config" in the SQL mutates
 * it, and rollback restores the map, like PostgreSQL does for a real session.
 */
function fakeDatabase(initial: Record<string, string>, rowCount = 3) {
  let settings = { ...initial };
  const log: string[] = [];

  const tx: SqlRunner = {
    $executeRawUnsafe: (sql: string) => {
      log.push(sql);
      return Promise.resolve(0);
    },
    $queryRawUnsafe: (sql: string) => {
      log.push(sql);
      if (sql.startsWith('SELECT current_setting')) {
        return Promise.resolve([{ ...settings, db_role: 'dental_app' }]);
      }
      const flip = /set_config\('([^']+)','([^']*)'/.exec(sql);
      if (flip) settings[flip[1]] = flip[2];
      const limit = Number(/LIMIT (\d+)$/.exec(sql)?.[1] ?? rowCount);
      return Promise.resolve(
        Array.from({ length: Math.min(rowCount, limit) }, (_, i) => ({ n: i })),
      );
    },
  };

  const prisma: TransactionRunner = {
    $transaction: async <T>(fn: (tx: SqlRunner) => Promise<T>) => {
      const saved = { ...settings };
      try {
        return await fn(tx);
      } catch (err) {
        settings = saved; // rollback
        throw err;
      }
    },
  };

  return { prisma, log, settings: () => settings };
}

describe('runGuardedSelect', () => {
  const start = { 'app.current_org': '1', 'app.bypass_rls': '' };

  it('runs the SELECT read-only, wrapped with a row cap, between two snapshots', async () => {
    const db = fakeDatabase(start);
    const result = await runGuardedSelect(
      db.prisma,
      'SELECT count(*) FROM appointments',
    );
    expect(result).toEqual({
      rows: [{ n: 0 }, { n: 1 }, { n: 2 }],
      truncated: false,
    });
    expect(db.log[0]).toBe('SET TRANSACTION READ ONLY');
    expect(db.log[2]).toBe(
      `SELECT * FROM (SELECT count(*) FROM appointments) AS agent_query LIMIT ${MAX_ROWS + 1}`,
    );
    expect(db.log).toHaveLength(4); // read-only, snapshot, query, snapshot
  });

  it('drops rows beyond the cap and says so', async () => {
    const db = fakeDatabase(start, MAX_ROWS + 50);
    const result = await runGuardedSelect(db.prisma, 'SELECT * FROM users');
    expect(result.rows).toHaveLength(MAX_ROWS);
    expect(result.truncated).toBe(true);
  });

  it('rolls back and refuses a statement that changed a session setting', async () => {
    const db = fakeDatabase(start);
    await expect(
      runGuardedSelect(
        db.prisma,
        "SELECT set_config('app.bypass_rls','on',false)",
      ),
    ).rejects.toBeInstanceOf(SessionTamperedError);
    expect(db.settings()['app.bypass_rls']).toBe('');
  });

  it('propagates the database error of a bad query', async () => {
    const prisma: TransactionRunner = {
      $transaction: (fn) =>
        fn({
          $executeRawUnsafe: () => Promise.resolve(0),
          $queryRawUnsafe: (sql: string) =>
            sql.startsWith('SELECT current_setting')
              ? Promise.resolve([{}])
              : Promise.reject(new Error('syntax error at or near "FORM"')),
        }),
    };
    await expect(
      runGuardedSelect(prisma, 'SELECT * FORM appointments'),
    ).rejects.toThrow(/syntax error/);
  });
});

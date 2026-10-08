import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLE_PERMISSIONS } from './agent-access';
import { AGENT_DB_ROLE, AGENT_PERMISSIONS_SETTING } from './guarded-select';

/**
 * The database enforces the same table -> permission map as the application
 * (migration 20261008210000_agent_permissions_rls). This keeps the two from
 * drifting: change TABLE_PERMISSIONS and this test tells you to ship a migration.
 */
const migration = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'prisma',
    'migrations',
    '20261008210000_agent_permissions_rls',
    'migration.sql',
  ),
  'utf8',
);

describe('agent permissions migration', () => {
  it('creates one restrictive policy per permission-gated table, with the same permission', () => {
    const pairs = [
      ...migration.matchAll(/\['([a-z_]+)',\s*'([a-z_]+:[a-z_]+)'\]/g),
    ].map((m) => [m[1], m[2]] as const);
    const fromCode = Object.entries(TABLE_PERMISSIONS)
      .filter((e): e is [string, string] => e[1] !== null)
      .sort();
    expect([...pairs].sort()).toEqual(fromCode);
  });

  it('grants SELECT on exactly the tables the assistant may read', () => {
    const grant = /GRANT SELECT ON\s+([\s\S]*?)\s+TO dental_agent;/.exec(
      migration,
    );
    expect(grant).not.toBeNull();
    const granted = grant![1]
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .sort();
    expect(granted).toEqual(Object.keys(TABLE_PERMISSIONS).sort());
  });

  it('uses the role and setting names the guard uses', () => {
    expect(migration).toContain(
      `CREATE ROLE ${AGENT_DB_ROLE} NOLOGIN NOINHERIT NOBYPASSRLS`,
    );
    expect(migration).toContain(
      `GRANT ${AGENT_DB_ROLE} TO dental_app WITH SET TRUE, INHERIT FALSE`,
    );
    expect(migration).toContain(
      `current_setting('${AGENT_PERMISSIONS_SETTING}', true)`,
    );
    expect(migration).toMatch(/AS RESTRICTIVE FOR SELECT TO dental_agent/);
  });
});

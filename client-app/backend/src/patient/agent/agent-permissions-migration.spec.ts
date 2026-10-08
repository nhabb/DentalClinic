import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLE_PERMISSIONS } from './agent-access';
import { AGENT_DB_ROLE, AGENT_PERMISSIONS_SETTING } from './guarded-select';

/**
 * The database enforces the same table -> permission map as the application:
 * every migration that adds tables the assistant may read carries
 * `agent_permission` policies and a `GRANT SELECT ... TO dental_agent`. This
 * keeps the two from drifting: change TABLE_PERMISSIONS and this test tells
 * you to ship a migration.
 */
const migrationsDir = join(__dirname, '..', '..', '..', 'prisma', 'migrations');

const migrations = readdirSync(migrationsDir)
  .filter((d) => !d.endsWith('.toml'))
  .map((d) => ({
    name: d,
    sql: readFileSync(join(migrationsDir, d, 'migration.sql'), 'utf8'),
  }))
  .filter((m) => m.sql.includes('agent_permission'));

const roleMigration = migrations.find((m) =>
  m.name.endsWith('_agent_permissions_rls'),
);

describe('agent permissions migrations', () => {
  it('found the migration that creates the agent role', () => {
    expect(roleMigration).toBeDefined();
  });

  it('create one restrictive policy per permission-gated table, with the same permission', () => {
    const pairs = migrations
      .flatMap((m) => [
        ...m.sql.matchAll(/\['([a-z_]+)',\s*'([a-z_]+:[a-z_]+)'\]/g),
      ])
      .map((m) => [m[1], m[2]] as const);
    const fromCode = Object.entries(TABLE_PERMISSIONS)
      .filter((e): e is [string, string] => e[1] !== null)
      .sort();
    expect([...pairs].sort()).toEqual(fromCode);
  });

  it('grant SELECT on exactly the tables the assistant may read', () => {
    const granted = migrations
      .flatMap((m) => [
        ...m.sql.matchAll(/GRANT SELECT ON\s+([\s\S]*?)\s+TO dental_agent;/g),
      ])
      .flatMap((m) => m[1].split(','))
      .map((t) => t.trim())
      .filter(Boolean)
      .sort();
    expect(granted).toEqual(Object.keys(TABLE_PERMISSIONS).sort());
  });

  it('use the role and setting names the guard uses', () => {
    const sql = roleMigration?.sql ?? '';
    expect(sql).toContain(
      `CREATE ROLE ${AGENT_DB_ROLE} NOLOGIN NOINHERIT NOBYPASSRLS`,
    );
    expect(sql).toContain(
      `GRANT ${AGENT_DB_ROLE} TO dental_app WITH SET TRUE, INHERIT FALSE`,
    );
    expect(sql).toContain(
      `current_setting('${AGENT_PERMISSIONS_SETTING}', true)`,
    );
    expect(sql).toMatch(/AS RESTRICTIVE FOR SELECT TO dental_agent/);
  });
});

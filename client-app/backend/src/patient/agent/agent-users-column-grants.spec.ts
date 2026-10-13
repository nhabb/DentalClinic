import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSensitiveColumn } from './agent-access';

/**
 * The assistant's database role reads users column by column (migration
 * 20261013190000_agent_users_column_grants). This keeps that list and
 * schema.prisma in step: every non-credential column must be granted, so the
 * assistant can still answer staff questions, and no credential column may be.
 */
const backendDir = join(__dirname, '..', '..', '..');
const migrationSql = readFileSync(
  join(
    backendDir,
    'prisma/migrations/20261013190000_agent_users_column_grants/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(join(backendDir, 'prisma/schema.prisma'), 'utf8');

/** Scalar (non-relation) column names of the users model. */
function usersColumns(): string[] {
  const models = new Set(
    [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]),
  );
  const block = schema.match(/^model users \{([\s\S]*?)^\}/m)?.[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.trim().match(/^(\w+)\s+(\w+)(\[\])?/))
    .filter((m): m is RegExpMatchArray => !!m)
    .filter((m) => !models.has(m[2]) && !m[3])
    .map((m) => m[1]);
}

function grantedColumns(): string[] {
  const list = migrationSql.match(
    /GRANT SELECT \(([\s\S]*?)\) ON public\.users TO dental_agent;/,
  )?.[1];
  if (!list) throw new Error('column grant not found in migration');
  return list
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

describe('assistant column grants on users', () => {
  it('revokes the whole-table grant first', () => {
    expect(migrationSql).toContain(
      'REVOKE SELECT ON public.users FROM dental_agent;',
    );
  });

  it('grants exactly the non-credential columns of users', () => {
    const expected = usersColumns().filter((c) => !isSensitiveColumn(c));
    expect(expected).toContain('email');
    expect(grantedColumns().sort()).toEqual(expected.sort());
  });

  it('never grants a credential column', () => {
    const columns = usersColumns();
    expect(columns).toContain('password_hash');
    expect(columns).toContain('password_setup_token_hash');
    expect(grantedColumns().filter(isSensitiveColumn)).toEqual([]);
  });
});

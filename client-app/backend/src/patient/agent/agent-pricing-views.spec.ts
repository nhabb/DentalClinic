import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HIDDEN_PRICE,
  hidePricingFields,
  PRICING_COLUMNS,
  PRICING_PERMISSION,
  TABLE_PERMISSIONS,
} from './agent-access';
import { AGENT_SEARCH_PATH } from './guarded-select';

/**
 * pricing:read is enforced for SQL by the views in schema `agent` (migration
 * 20261013200000_pricing_permission_and_agent_views). This keeps the views,
 * PRICING_COLUMNS and schema.prisma in step: every table with a price column
 * has a view, every column of the table is in the view, and exactly the price
 * columns are gated on app.agent_has('pricing:read').
 */
const backendDir = join(__dirname, '..', '..', '..');
const sql = readFileSync(
  join(
    backendDir,
    'prisma/migrations/20261013200000_pricing_permission_and_agent_views/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(join(backendDir, 'prisma/schema.prisma'), 'utf8');

const models = new Set(
  [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]),
);

/** Scalar (non-relation) column names of a model, in schema order. */
function columnsOf(table: string): string[] {
  const start = schema.indexOf(`\nmodel ${table} {`);
  const end = schema.indexOf('\n}', start);
  const block = start >= 0 && end > start ? schema.slice(start, end) : '';
  return block
    .split('\n')
    .slice(2)
    .map((line) => line.trim().match(/^(\w+)\s+(\w+)(\[\])?/))
    .filter((m): m is RegExpMatchArray => !!m)
    .filter((m) => !models.has(m[2]) && !m[3])
    .map((m) => m[1]);
}

/** The view's SELECT list: plain columns and the gated ones. */
function viewOf(table: string): { plain: string[]; gated: string[] } {
  const head = `CREATE OR REPLACE VIEW agent.${table} AS`;
  const tail = `FROM public.${table};`;
  const start = sql.indexOf(head);
  const end = sql.indexOf(tail, start);
  if (start < 0 || end < 0) throw new Error(`no view for ${table}`);
  const body = sql.slice(start + head.length, end).replace(/^\s*SELECT/, '');
  const plain: string[] = [];
  const gated: string[] = [];
  for (const item of body.split(',').map((s) => s.trim())) {
    const g = item.match(
      /^CASE WHEN app\.agent_has\('pricing:read'\) THEN (\w+) END AS (\w+)$/,
    );
    if (g) {
      expect(g[1]).toBe(g[2]);
      gated.push(g[2]);
    } else if (/^\w+$/.test(item)) {
      plain.push(item);
    } else {
      throw new Error(`unexpected select item in agent.${table}: ${item}`);
    }
  }
  return { plain, gated };
}

/** The statement starting with `head` and ending at the first ';' after it. */
function statement(head: string, from = 0): string {
  const start = sql.indexOf(head, from);
  if (start < 0) throw new Error(`no statement starting with ${head}`);
  return sql.slice(start, sql.indexOf(';', start) + 1);
}

describe('pricing views for the assistant', () => {
  const tables = Object.keys(PRICING_COLUMNS);

  it('cover tables the assistant may read', () => {
    for (const t of tables) expect(TABLE_PERMISSIONS[t]).toBeDefined();
  });

  it('list every column of the table and gate exactly the price columns', () => {
    for (const t of tables) {
      const { plain, gated } = viewOf(t);
      expect(gated.sort()).toEqual([...PRICING_COLUMNS[t]].sort());
      expect([...plain, ...gated].sort()).toEqual(columnsOf(t).sort());
    }
  });

  it('are what dental_agent reads instead of the base tables', () => {
    const grant = statement('GRANT SELECT ON\n    agent.');
    const revoke = statement('REVOKE SELECT ON');
    expect(grant).toContain('TO dental_agent;');
    expect(revoke).toContain('FROM dental_agent;');
    for (const t of tables) {
      expect(grant).toContain(`agent.${t}`);
      expect(revoke).toContain(`public.${t}`);
      expect(sql).toContain(
        `ALTER VIEW agent.${t} OWNER TO dental_agent_views;`,
      );
    }
    expect(sql).toContain(
      'CREATE ROLE dental_agent_views NOLOGIN NOINHERIT NOBYPASSRLS',
    );
    expect(AGENT_SEARCH_PATH.split(',')[0].trim()).toBe('agent');
  });

  it('keep the same table permission for the view owner as for the app', () => {
    const pairs = [...sql.matchAll(/\['([a-z_]+)',\s*'([a-z_]+:[a-z_]+)'\]/g)]
      .map((m) => [m[1], m[2]])
      .sort();
    expect(pairs).toEqual(tables.map((t) => [t, TABLE_PERMISSIONS[t]]).sort());
  });

  it('grant pricing:read to every role that already has billing:read', () => {
    const insert = statement('INSERT INTO public.role_permissions');
    expect(insert).toContain(`'${PRICING_PERMISSION}'`);
    expect(insert).toContain("WHERE permission = 'billing:read'");
  });
});

describe('hidePricingFields', () => {
  it('replaces price fields anywhere in a tool result, keeps the rest', () => {
    const out = hidePricingFields({
      rows: [
        {
          id: 1,
          title: 'Crown',
          quoted_amount: '250.00',
          nested: { cost: 40 },
        },
        { id: 2, title: 'Note', quoted_amount: null },
      ],
      truncated: false,
    });
    expect(out).toEqual({
      rows: [
        {
          id: 1,
          title: 'Crown',
          quoted_amount: HIDDEN_PRICE,
          nested: { cost: HIDDEN_PRICE },
        },
        { id: 2, title: 'Note', quoted_amount: null },
      ],
      truncated: false,
    });
  });
});

/**
 * Smoke test for the AI assistant's data boundary, against the real database
 * and without OpenAI: hostile and legitimate SQL goes straight through the
 * tool layer (AgentService.executeTool) as the demo secretary, and the
 * transaction guard is attacked directly with the policy bypassed on purpose.
 *
 *   npm run smoke:agent          # needs .env and the demo accounts
 *
 * Add every new bypass you find to HOSTILE: this file is the regression list.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ToolRunner } from '../src/patient/agent/tools/tool-runner';
import { RolesService } from '../src/shared/authorization/roles.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import {
  runAsSystem,
  runWithTenant,
} from '../src/shared/tenant/tenant-context';
import { runGuardedSelect } from '../src/patient/agent/guarded-select';
import { ToolArgs } from '../src/patient/agent/tool-args';
import type { RequestUser } from '../src/shared/common/guards/jwt-auth.guard';

const results: { check: string; ok: string; detail: string }[] = [];
const record = (check: string, ok: boolean, detail = '') =>
  results.push({
    check,
    ok: ok ? 'PASS' : 'FAIL',
    detail: detail.replace(/\s+/g, ' ').slice(0, 95),
  });

/** Attacks a secretary (no staff:manage, no roles:manage, no records:read) might try. Every one must be refused. */
const HOSTILE: [string, RegExp][] = [
  ["SELECT set_config('app.bypass_rls','on',false)", /set_config/],
  ["SELECT \"set_config\"('app.bypass_rls','on',false)", /set_config/],
  ["SELECT set_config/**/('app.bypass_rls','on',false)", /set_config/],
  ["SELECT pg_catalog.set_config('app.current_org','2',false)", /set_config/],
  [
    "SELECT * FROM (SELECT set_config('app.bypass_rls','on',false)) s, appointments",
    /set_config/,
  ],
  [
    "SELECT * FROM appointments WHERE set_config('app.branch_scope','',false) IS NOT NULL",
    /set_config/,
  ],
  ['SELECT 1; DELETE FROM expenses', /Exactly one/],
  ['SELECT * FROM (TABLE audit_logs) x', /Could not parse/],
  ['SELECT * FROM audit_logs', /staff:manage/],
  [
    'SELECT * FROM appointments WHERE id IN (SELECT record_id FROM audit_logs)',
    /staff:manage/,
  ],
  ['WITH a AS (SELECT * FROM audit_logs) SELECT * FROM a', /Only SELECT/],
  ['SELECT * FROM roles', /roles:manage/],
  ['SELECT * FROM notifications', /staff:manage/],
  ['SELECT * FROM auth.users', /restricted/],
  ['SELECT * FROM storage.objects', /schema "storage"/],
  ['SELECT * FROM pg_catalog.pg_roles', /schema "pg_catalog"/],
  ['SELECT * FROM pg_stat_activity', /may not read/],
  ['SELECT * FROM information_schema.tables', /schema "information_schema"/],
  ['SELECT id, password_setup_token_hash FROM users', /restricted/],
  ['SELECT password_hash AS p FROM users', /restricted/],
  ["SELECT query_to_xml('TABLE users', true, false, '')", /query_to_xml/],
  ["SELECT pg_read_file('/etc/hosts')", /pg_read_file/],
  ["SELECT nextval('users_id_seq')", /nextval/],
  ['SELECT pg_sleep(5)', /pg_sleep/],
  ["SELECT current_setting('app.current_org')", /current_setting/],
  ['SELECT app.is_system()', /app\.is_system/],
  ['SELECT * FROM users FOR UPDATE', /row locking/],
  ['SELECT * INTO leaked FROM appointments', /Could not parse/],
  ['DELETE FROM expenses', /Only SELECT/],
  [
    'WITH x AS (DELETE FROM expenses RETURNING *) SELECT * FROM x',
    /Only SELECT/,
  ],
  ['SELECT * FROM mystery_table', /may not read/],
  [
    'SELECT * FROM audit_logs al WHERE EXISTS (WITH audit_logs AS (SELECT 1) SELECT 1)',
    /WITH query named like the table/,
  ],
  [
    'SELECT * FROM (WITH patient_records AS (SELECT * FROM patient_records) SELECT * FROM patient_records) z',
    /WITH query named like the table|records:read/,
  ],
  [
    'SELECT * FROM (WITH role_permissions AS (SELECT * FROM role_permissions) SELECT * FROM role_permissions) z',
    /WITH query named like the table/,
  ],
  [
    'SELECT * FROM (WITH roles AS (SELECT * FROM public.roles) SELECT * FROM roles) r',
    /WITH query named like the table/,
  ],
  ["SELECT lo_import('/etc/hosts')", /lo_import/],
  ["SELECT * FROM dblink('dbname=postgres','select 1') AS t", /dblink/],
];

/** Queries a secretary may run. Each must return rows (and only this clinic's). */
const LEGIT = [
  'SELECT count(*)::int AS n FROM appointments',
  'SELECT status, count(*)::int AS n FROM appointments GROUP BY status ORDER BY n DESC',
  "SELECT date_trunc('month', expense_date)::date AS m, sum(amount)::float AS total FROM expenses GROUP BY 1 ORDER BY 1 DESC LIMIT 3",
  'SELECT b.name, count(a.id)::int AS n FROM branches b LEFT JOIN appointments a ON a.branch_id = b.id GROUP BY b.name',
  "SELECT count(*) FILTER (WHERE status = 'paid')::int AS paid FROM treatment_invoices",
  'SELECT DISTINCT ON (patient_id) patient_id, appointment_date FROM appointments ORDER BY patient_id, appointment_date DESC LIMIT 3',
  "SELECT d::date AS day FROM generate_series(CURRENT_DATE - 2, CURRENT_DATE, '1 day') d",
  'SELECT a.id, p.id FROM appointments a JOIN patient_profiles p ON p.id = a.patient_id LIMIT 2',
  'SELECT (SELECT count(*) FROM appointments)::int AS appts, (SELECT count(*) FROM patient_profiles)::int AS patients',
  'SELECT count(*)::int AS n FROM organizations',
];

async function main() {
  Logger.overrideLogger(['error']);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const tools = app.get(ToolRunner);
  const roles = app.get(RolesService);
  const prisma = app.get(PrismaService);

  const row = await runAsSystem(() =>
    prisma.users.findFirst({
      where: { email: 'secretary@demo.com' },
      select: { id: true, organization_id: true, role: true },
    }),
  );
  if (!row?.organization_id) throw new Error('secretary@demo.com not found');
  const orgId = row.organization_id;
  const permissions = await roles.permissionsFor(orgId, row.role);
  const user: RequestUser = {
    id: row.id.toString(),
    role: row.role,
    organization_id: orgId.toString(),
    branch_id: null,
    branch_scope_id: null,
    permissions,
  };
  const ctx = {
    organizationId: orgId,
    homeBranchId: null,
    branchScopeId: null,
    userId: row.id,
    role: row.role,
    accountStatus: 'active' as const,
    system: false,
    permissions,
    source: 'jwt' as const,
  };
  const sql = (q: string) =>
    tools.run(user, 'query_database', new ToolArgs({ sql: q }));
  const parse = (s: string) => JSON.parse(s) as { error?: string };

  await runWithTenant(ctx, async () => {
    for (const [q, expected] of HOSTILE) {
      const r = parse(await sql(q));
      record(
        `refused: ${q}`,
        expected.test(r.error ?? ''),
        r.error ?? 'NO ERROR, RETURNED DATA',
      );
    }
    for (const q of LEGIT) {
      const r = parse(await sql(q));
      const rows = Array.isArray(r) ? (r as unknown[]) : [];
      record(
        `allowed: ${q}`,
        !r.error && Array.isArray(r),
        r.error ?? JSON.stringify(rows.slice(0, 2)),
      );
    }
    const orgs = parse(
      await sql('SELECT id::int AS id FROM organizations'),
    ) as unknown as { id: number }[];
    record(
      'tenant: only own organization visible via SQL',
      Array.isArray(orgs) && orgs.length === 1 && orgs[0].id === Number(orgId),
      JSON.stringify(orgs),
    );

    // Straight to the guard, skipping the policy: the database layer must still hold.
    let caught = '';
    try {
      await runGuardedSelect(
        prisma,
        "SELECT set_config('app.bypass_rls','on',false)",
        permissions,
      );
    } catch (e) {
      caught = (e as Error).name;
    }
    let dbRefusal = '';
    try {
      await runGuardedSelect(prisma, 'SELECT * FROM roles', permissions);
    } catch (e) {
      dbRefusal = (e as Error).message;
    }
    record(
      'db backstop: roles (4 rows) refused by Postgres for the secretary (policy bypassed on purpose)',
      /roles:manage is required/.test(dbRefusal),
      dbRefusal,
    );
    let unset = '';
    try {
      await runGuardedSelect(prisma, 'SELECT * FROM appointments', []);
    } catch (e) {
      unset = (e as Error).message;
    }
    record(
      'db backstop: no permission list means no reads (fail closed)',
      /agent permissions are not set/.test(unset),
      unset,
    );
    const okRead = await runGuardedSelect(
      prisma,
      'SELECT count(*)::int AS n FROM appointments',
      permissions,
    );
    record(
      'db backstop: permitted table still readable as dental_agent',
      okRead.rows.length === 1,
      JSON.stringify(okRead.rows),
    );
    const star = await runGuardedSelect(
      prisma,
      'SELECT count(*)::int AS n FROM audit_logs',
      '*',
    );
    record(
      'db backstop: "*" (superadmin) reads any mapped table',
      star.rows.length === 1,
      JSON.stringify(star.rows),
    );
    let write = '';
    try {
      await runGuardedSelect(prisma, "SELECT nextval('users_id_seq')", '*');
    } catch (e) {
      write = (e as Error).message;
    }
    record(
      'db backstop: dental_agent cannot touch sequences',
      /permission denied|read-only/.test(write),
      write,
    );
    record(
      'guard: set_config rolled back (policy bypassed on purpose)',
      caught === 'SessionTamperedError',
      caught,
    );
    let msg = '';
    try {
      await runGuardedSelect(prisma, 'SELECT 1; SELECT 2', permissions);
    } catch (e) {
      msg = (e as Error).message;
    }
    record(
      'guard: a second statement cannot run (read-only tx + wrapper)',
      msg !== '',
      msg || 'ran without error',
    );
    const [state] = (await prisma.$queryRawUnsafe(
      "SELECT current_setting('app.bypass_rls', true) AS b, current_setting('app.current_org', true) AS o, current_user AS u",
    )) as { b: string; o: string; u: string }[];
    record(
      'guard: connection settings intact afterwards',
      state.b !== 'on' &&
        state.o === orgId.toString() &&
        state.u === 'dental_app',
      JSON.stringify(state),
    );
    const big = await runGuardedSelect(
      prisma,
      'SELECT g FROM generate_series(1, 500) g',
      permissions,
    );
    record(
      'guard: rows capped at 200 and flagged',
      big.rows.length === 200 && big.truncated,
      `rows=${big.rows.length} truncated=${big.truncated}`,
    );
  });

  await app.close();
  console.table(results);
  const failed = results.filter((r) => r.ok === 'FAIL').length;
  console.log(
    failed
      ? `${failed} check(s) failed`
      : `all ${results.length} checks passed`,
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});

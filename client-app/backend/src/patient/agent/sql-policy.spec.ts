import { analyzeSelect } from './sql-policy';

const tablesOf = (sql: string) => {
  const r = analyzeSelect(sql);
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.tables.sort();
};
const reasonOf = (sql: string) => {
  const r = analyzeSelect(sql);
  if (r.ok)
    throw new Error(`expected refusal, got tables ${r.tables.join(',')}`);
  return r.reason;
};

describe('analyzeSelect: what the model normally writes', () => {
  it.each([
    [
      "SELECT status, count(*) AS n FROM appointments WHERE appointment_date BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY status HAVING count(*) > 1 ORDER BY n DESC LIMIT 10",
      ['appointments'],
    ],
    [
      'SELECT p.first_name, sum(i.total_amount) FROM treatment_invoices i JOIN patient_profiles pp ON pp.id = i.patient_id JOIN users p ON p.id = pp.user_id GROUP BY 1',
      ['patient_profiles', 'treatment_invoices', 'users'],
    ],
    [
      "SELECT date_trunc('month', expense_date)::date AS month, sum(amount) FROM expenses WHERE expense_date >= now() - interval '6 months' GROUP BY 1",
      ['expenses'],
    ],
    [
      "SELECT count(*) FILTER (WHERE status = 'paid') FROM treatment_invoices",
      ['treatment_invoices'],
    ],
    [
      'SELECT EXTRACT(dow FROM appointment_date), count(*) FROM appointments GROUP BY 1',
      ['appointments'],
    ],
    [
      'SELECT a.id FROM appointments a WHERE NOT EXISTS (SELECT 1 FROM treatment_invoices t WHERE t.appointment_id = a.id)',
      ['appointments', 'treatment_invoices'],
    ],
    [
      'SELECT (SELECT count(*) FROM audit_logs) AS n FROM organizations',
      ['audit_logs', 'organizations'],
    ],
    [
      'WITH recent AS (SELECT * FROM appointments WHERE appointment_date > CURRENT_DATE - 7) SELECT count(*) FROM recent',
      ['appointments'],
    ],
    [
      'SELECT count(*) FROM appointments UNION ALL SELECT count(*) FROM users',
      ['appointments', 'users'],
    ],
    [
      "SELECT d::date FROM generate_series('2026-01-01'::date, '2026-01-31', '1 day') d",
      [],
    ],
    [
      'SELECT u.* FROM users u, LATERAL (SELECT * FROM appointments a WHERE a.doctor_id = u.id LIMIT 1) l',
      ['appointments', 'users'],
    ],
    ['SELECT * FROM public.branches', ['branches']],
    [
      'SELECT row_number() OVER (ORDER BY created_at), lower(name) FROM inventory_items',
      ['inventory_items'],
    ],
    ["SELECT * FROM (VALUES (1,'a')) AS v(id, name)", []],
    ["SELECT 1 WHERE 'a' = ANY(ARRAY['a','b'])", []],
  ])('allows %s', (sql, tables) => {
    expect(tablesOf(sql)).toEqual(tables);
  });
});

describe('analyzeSelect: attacks on the tenant and permission boundary', () => {
  it('refuses set_config in every spelling, including inside a subquery', () => {
    for (const sql of [
      "SELECT set_config('app.bypass_rls','on',false)",
      "SELECT \"set_config\"('app.bypass_rls','on',false)",
      "SELECT set_config/**/('app.bypass_rls','on',false)",
      "SELECT pg_catalog.set_config('app.current_org','2',false)",
      "SELECT * FROM (SELECT set_config('app.bypass_rls','on',false)) s, patient_profiles",
      "SELECT * FROM users WHERE set_config('app.bypass_rls','on',false) IS NOT NULL",
    ]) {
      expect(reasonOf(sql)).toMatch(/function "(pg_catalog\.)?set_config"/);
    }
  });

  it('refuses a second statement and writes hidden in a CTE', () => {
    expect(reasonOf('SELECT 1; DELETE FROM expenses')).toMatch(
      /Exactly one SELECT/,
    );
    expect(
      reasonOf('WITH x AS (DELETE FROM expenses RETURNING *) SELECT * FROM x'),
    ).toMatch(/statement kind "delete"/);
    expect(
      reasonOf(
        "WITH x AS (INSERT INTO expenses (title) VALUES ('a') RETURNING *) SELECT 1",
      ),
    ).toMatch(/statement kind "insert"/);
  });

  it('refuses syntax it cannot vouch for (TABLE, SELECT INTO, TABLESAMPLE)', () => {
    expect(reasonOf('SELECT * FROM (TABLE users) x')).toMatch(
      /Could not parse/,
    );
    expect(reasonOf('TABLE users')).toMatch(/Could not parse/);
    expect(reasonOf('SELECT * INTO t2 FROM users')).toMatch(/Could not parse/);
    expect(reasonOf('SELECT * FROM users TABLESAMPLE SYSTEM (10)')).toMatch(
      /Could not parse/,
    );
  });

  it('refuses functions that run SQL from a string, read files or move sequences', () => {
    expect(
      reasonOf("SELECT query_to_xml('TABLE users', true, false, '')"),
    ).toMatch(/function "query_to_xml"/);
    expect(
      reasonOf("SELECT * FROM dblink('dbname=x', 'select 1') AS t"),
    ).toMatch(/function "dblink"/);
    expect(reasonOf("SELECT pg_read_file('/etc/passwd')")).toMatch(
      /function "pg_read_file"/,
    );
    expect(reasonOf("SELECT nextval('users_id_seq')")).toMatch(
      /function "nextval"/,
    );
    expect(reasonOf('SELECT pg_sleep(10)')).toMatch(/function "pg_sleep"/);
    expect(reasonOf('SELECT app.is_system()')).toMatch(
      /function "app.is_system"/,
    );
    expect(reasonOf("SELECT current_setting('app.current_org')")).toMatch(
      /function "current_setting"/,
    );
  });

  it('refuses other schemas and row locks', () => {
    expect(reasonOf('SELECT * FROM auth.users')).toMatch(/schema "auth"/);
    expect(reasonOf('SELECT * FROM storage.objects')).toMatch(
      /schema "storage"/,
    );
    expect(reasonOf('SELECT * FROM pg_catalog.pg_roles')).toMatch(
      /schema "pg_catalog"/,
    );
    expect(reasonOf('SELECT * FROM users FOR UPDATE')).toMatch(/row locking/);
  });

  it('reports every table a query touches so each can be permission-checked', () => {
    expect(
      tablesOf(
        'SELECT * FROM appointments WHERE patient_id IN (SELECT id FROM patient_profiles WHERE user_id IN (SELECT user_id FROM notifications))',
      ),
    ).toEqual(['appointments', 'notifications', 'patient_profiles']);
  });

  it('refuses a CTE named like a real table, which would hide the table it reads', () => {
    const known = new Set(['audit_logs', 'users', 'roles', 'role_permissions']);
    for (const sql of [
      'SELECT * FROM audit_logs al WHERE EXISTS (WITH audit_logs AS (SELECT 1) SELECT 1)',
      'SELECT * FROM (WITH role_permissions AS (SELECT * FROM role_permissions) SELECT * FROM role_permissions) z',
      'SELECT * FROM (WITH roles AS (SELECT * FROM public.roles) SELECT * FROM roles) r',
      'WITH users AS (SELECT * FROM audit_logs) SELECT * FROM users',
      'SELECT * FROM (WITH audit_logs AS (SELECT * FROM audit_logs) SELECT * FROM audit_logs) x',
      'SELECT * FROM appointments WHERE EXISTS (WITH users AS (SELECT * FROM users) SELECT 1 FROM users)',
    ]) {
      const r = analyzeSelect(sql, known);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/WITH query named like the table/);
    }
    // A CTE with its own name is fine and is not reported as a table.
    expect(
      analyzeSelect(
        'WITH recent AS (SELECT * FROM audit_logs) SELECT * FROM recent',
        known,
      ),
    ).toEqual({ ok: true, tables: ['audit_logs'] });
  });

  it('refuses over-long input', () => {
    expect(reasonOf('SELECT ' + '1,'.repeat(5000) + '1')).toMatch(/too long/);
  });
});

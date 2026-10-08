import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  isKnownPermission,
} from '../../shared/authorization/permissions';
import { AGENT_TOOLS } from './agent.tools';
import {
  TABLE_PERMISSIONS,
  TOOL_PERMISSIONS,
  describeAccess,
  redactSensitiveFields,
  sqlDenial,
  toolDenial,
  toolsFor,
} from './agent-access';

const toolNames = () => AGENT_TOOLS.map((t) => t.function.name);

function userWith(role: string, permissions: string[]): RequestUser {
  return {
    id: '7',
    role,
    organization_id: '1',
    branch_id: '1',
    branch_scope_id: null,
    permissions,
  };
}

const rolePermissions = (key: string) =>
  [
    ...(DEFAULT_ROLES.find((r) => r.key === key)?.permissions ?? []),
  ] as string[];

const admin = userWith('admin', [...ALL_PERMISSIONS]);
const secretary = userWith('secretary', rolePermissions('secretary'));
const doctor = userWith('doctor', rolePermissions('doctor'));
const nobody = userWith('intern', ['agent:use']);
const superadmin = userWith('superadmin', []);

describe('agent access: tool coverage', () => {
  it('labels every tool with a permission (or null)', () => {
    const unlabelled = toolNames().filter(
      (name) => TOOL_PERMISSIONS[name] === undefined,
    );
    expect(unlabelled).toEqual([]);
  });

  it('has no labels for tools that no longer exist', () => {
    const existing = new Set(toolNames());
    const stale = Object.keys(TOOL_PERMISSIONS).filter((n) => !existing.has(n));
    expect(stale).toEqual([]);
  });

  it('only uses permissions from the catalog', () => {
    const bad = [
      ...Object.values(TOOL_PERMISSIONS),
      ...Object.values(TABLE_PERMISSIONS),
    ].filter((p): p is string => p !== null && !isKnownPermission(p));
    expect(bad).toEqual([]);
  });
});

describe('agent access: which tools a user sees', () => {
  it('shows an admin every tool', () => {
    expect(
      toolsFor(admin)
        .map((t) => t.function.name)
        .sort(),
    ).toEqual(toolNames().sort());
  });

  it('hides billing and roles tools from a user without those permissions', () => {
    const names = toolsFor(nobody).map((t) => t.function.name);
    expect(names).toEqual(
      expect.arrayContaining(['get_my_permissions', 'query_database']),
    );
    expect(names).not.toContain('list_invoices');
    expect(names).not.toContain('list_roles');
    expect(names).not.toContain('cancel_appointment');
  });

  it('hides roles management from a secretary but keeps billing', () => {
    const names = toolsFor(secretary).map((t) => t.function.name);
    expect(names).toContain('list_invoices');
    expect(names).toContain('create_expense');
    expect(names).not.toContain('list_roles');
  });

  it('lets a superadmin see everything without an explicit permission list', () => {
    expect(toolsFor(superadmin)).toHaveLength(AGENT_TOOLS.length);
  });
});

describe('agent access: running a tool', () => {
  it('allows a tool the role holds the permission for', () => {
    expect(toolDenial(doctor, 'create_invoice')).toBeNull();
  });

  it('names the missing permission with its label', () => {
    expect(toolDenial(doctor, 'create_expense')).toMatch(
      /lacks the permission: expenses:write \(Record, edit and delete expenses/,
    );
  });

  it('refuses tools that are not in the catalog, even for admins', () => {
    expect(toolDenial(admin, 'execute_sql')).toMatch(/Unknown tool/);
  });
});

describe('agent access: raw SQL and permissions', () => {
  it('allows a SELECT over tables the user may read', () => {
    expect(
      sqlDenial(
        secretary,
        'SELECT count(*) FROM appointments WHERE appointment_date = CURRENT_DATE',
      ),
    ).toBeNull();
    expect(
      sqlDenial(
        doctor,
        'SELECT e.amount FROM expenses e JOIN expense_payments p ON p.expense_id = e.id',
      ),
    ).toBeNull();
  });

  it('refuses anything but a SELECT at the top', () => {
    expect(sqlDenial(admin, 'DELETE FROM expenses')).toMatch(/Only SELECT/);
    expect(sqlDenial(admin, 'WITH x AS (SELECT 1) SELECT * FROM x')).toMatch(
      /Only SELECT/,
    );
    expect(sqlDenial(admin, '/* hi */ SELECT 1')).toMatch(/Only SELECT/);
  });

  it('names the permission a user lacks for each table, in subqueries too', () => {
    expect(
      sqlDenial(nobody, 'SELECT sum(total_amount) FROM treatment_invoices'),
    ).toMatch(/lacks the permission: billing:read/);
    expect(
      sqlDenial(
        doctor,
        'SELECT r.key FROM roles r JOIN role_permissions rp ON rp.role_id = r.id',
      ),
    ).toMatch(/lacks the permission: roles:manage/);
    expect(
      sqlDenial(
        secretary,
        'SELECT * FROM appointments WHERE id IN (SELECT record_id FROM audit_logs)',
      ),
    ).toMatch(/lacks the permission: staff:manage/);
    expect(
      sqlDenial(nobody, 'SELECT * FROM (SELECT * FROM patient_profiles) x'),
    ).toMatch(/lacks the permission: patients:read/);
  });

  it('refuses tables outside the map, even for admins', () => {
    expect(sqlDenial(admin, 'SELECT * FROM mystery_table')).toMatch(
      /may not read: mystery_table/,
    );
    expect(sqlDenial(admin, 'SELECT * FROM pg_stat_activity')).toMatch(
      /may not read: pg_stat_activity/,
    );
  });

  it('passes the parser’s refusals through (set_config, other schemas, writes)', () => {
    expect(
      sqlDenial(admin, "SELECT set_config('app.bypass_rls','on',false)"),
    ).toMatch(/function "set_config"/);
    expect(
      sqlDenial(admin, "SELECT \"set_config\"('app.bypass_rls','on',false)"),
    ).toMatch(/function "set_config"/);
    expect(sqlDenial(admin, 'SELECT * FROM storage.objects')).toMatch(
      /schema "storage"/,
    );
    expect(sqlDenial(admin, 'SELECT 1; DELETE FROM expenses')).toMatch(
      /Exactly one SELECT/,
    );
    expect(
      sqlDenial(admin, 'SELECT * FROM (TABLE patient_profiles) x'),
    ).toMatch(/Could not parse/);
    expect(
      sqlDenial(admin, "SELECT query_to_xml('TABLE users', true, false, '')"),
    ).toMatch(/function "query_to_xml"/);
  });

  it('refuses credential columns for everyone, aliases and fragments included', () => {
    expect(sqlDenial(admin, 'SELECT password_hash FROM users')).toMatch(
      /restricted/,
    );
    expect(sqlDenial(admin, 'SELECT password_hash AS p FROM users')).toMatch(
      /restricted/,
    );
    expect(
      sqlDenial(admin, 'SELECT id, password_setup_token_hash FROM users'),
    ).toMatch(/restricted/);
    expect(sqlDenial(admin, 'SELECT refresh_token FROM users')).toMatch(
      /restricted/,
    );
    expect(sqlDenial(admin, 'SELECT * FROM auth.users')).toMatch(/restricted/);
  });

  it('lets a superadmin read any mapped table', () => {
    expect(sqlDenial(superadmin, 'SELECT * FROM audit_logs')).toBeNull();
  });
});

describe('agent access: describing permissions', () => {
  it('splits the catalog into granted and denied for the user', () => {
    const { granted, denied } = describeAccess(doctor);
    expect(granted.map((p) => p.key)).toContain('billing:write');
    expect(denied.map((p) => p.key)).toContain('roles:manage');
    expect(granted.length + denied.length).toBe(ALL_PERMISSIONS.length);
    expect(describeAccess(admin).denied).toEqual([]);
  });
});

describe('agent access: redaction', () => {
  it('masks credential-like fields at any depth, by name fragment', () => {
    expect(
      redactSensitiveFields([
        {
          id: 1,
          password_hash: 'x',
          password_setup_token_hash: 'y',
          api_key_v2: 'z',
          profile: { token: 't', name: 'n' },
        },
      ]),
    ).toEqual([
      {
        id: 1,
        password_hash: '[REDACTED]',
        password_setup_token_hash: '[REDACTED]',
        api_key_v2: '[REDACTED]',
        profile: { token: '[REDACTED]', name: 'n' },
      },
    ]);
  });
});

describe('agent access: redaction keeps typed values', () => {
  it('leaves Date, Decimal-like and bigint values intact while redacting plain objects', () => {
    const when = new Date('2026-10-08T00:00:00.000Z');
    class Decimal {
      constructor(private readonly v: string) {}
      toJSON() {
        return this.v;
      }
    }
    const out = redactSensitiveFields({
      when,
      amount: new Decimal('1.5'),
      id: 10n,
      nested: { token: 'x', when },
    });
    expect(out.when).toBe(when);
    expect(JSON.stringify(out.amount)).toBe('"1.5"');
    expect(out.id).toBe(10n);
    expect(out.nested).toEqual({ token: '[REDACTED]', when });
  });
});

describe('agent access: CTE shadowing', () => {
  it('refuses a nested WITH named after a table the user may not read', () => {
    expect(
      sqlDenial(
        secretary,
        'SELECT * FROM (WITH audit_logs AS (SELECT * FROM audit_logs) SELECT * FROM audit_logs) x',
      ),
    ).toMatch(/WITH query named like the table "audit_logs"/);
  });
});

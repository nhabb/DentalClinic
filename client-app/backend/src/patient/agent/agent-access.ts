import type OpenAI from 'openai';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import { PERMISSION_GROUPS } from '../../shared/authorization/permissions';
import { AGENT_TOOLS } from './agent.tools';
import { analyzeSelect } from './sql-policy';

/**
 * What the AI assistant may do on behalf of a user.
 *
 * The assistant reuses the clinic's permission catalog: every tool is labelled
 * with the permission its equivalent API route needs, and the raw SQL tool is
 * checked table by table. Tools and tables with no label are refused, so a new
 * tool is closed until someone decides who may use it (agent-access.spec.ts
 * fails until they do).
 */

/** Permission each tool needs. `null` = anyone allowed to use the assistant. */
export const TOOL_PERMISSIONS: Readonly<Record<string, string | null>> = {
  // Self and roles
  get_my_permissions: null,
  list_roles: 'roles:edit',

  // Appointments and slots
  list_appointments: 'appointments:read',
  get_appointment: 'appointments:read',
  list_slots: 'appointments:read',

  // Patients
  list_patients: 'patients:read',
  get_patient: 'patients:read',
  list_patient_documents: 'documents:read',

  // Inventory
  list_inventory: 'inventory:read',
  get_low_stock_items: 'inventory:read',
  list_inventory_movements: 'inventory:read',

  // Team
  list_doctors: 'staff:read',

  // Billing (read-only: the assistant never creates invoices or records payments)
  get_financial_kpis: 'billing:read',
  get_financial_summary: 'billing:read',
  get_payments_analytics: 'billing:read',
  get_outstanding_payments: 'billing:read',
  get_aging_report: 'billing:read',
  get_patient_financials: 'billing:read',
  list_invoices: 'billing:read',
  list_payments: 'billing:read',
  get_invoice: 'billing:read',

  // Expenses
  list_expenses: 'expenses:read',
  get_expenses_analytics: 'expenses:read',

  // Specialists and lab (read-only)
  list_consultations: 'specialists:read',
  list_lab_orders: 'lab:read',

  // Raw SQL: allowed for everyone, but each table it touches is checked below.
  query_database: null,
};

/** Permission needed to read each table through query_database. */
export const TABLE_PERMISSIONS: Readonly<Record<string, string | null>> = {
  organizations: null,
  branches: null,
  clinic_profile: null,
  appointments: 'appointments:read',
  appointment_slots: 'appointments:read',
  patient_profiles: 'patients:read',
  patient_records: 'records:read',
  patient_documents: 'documents:read',
  users: 'staff:read',
  treatment_invoices: 'billing:read',
  invoice_line_items: 'billing:read',
  invoice_payments: 'billing:read',
  payment_allocations: 'billing:read',
  quotes: 'billing:read',
  quote_sends: 'billing:read',
  expenses: 'expenses:read',
  expense_payments: 'expenses:read',
  inventory_items: 'inventory:read',
  inventory_movements: 'inventory:read',
  notifications: 'staff:edit',
  roles: 'roles:edit',
  role_permissions: 'roles:edit',
  audit_logs: 'staff:edit',
  specialists: 'specialists:read',
  specialist_consultations: 'specialists:read',
  dental_labs: 'lab:read',
  lab_orders: 'lab:read',
};

/**
 * Prices and costs need pricing:read on top of the table's own permission.
 * The database enforces it for SQL: the assistant reads these tables through
 * views (schema `agent`, migration 20261013200000_pricing_permission_and_agent_views)
 * that return the column only when the transaction's permission list holds
 * pricing:read. Tool results are filtered here with hidePricingFields().
 * agent-pricing-views.spec.ts keeps this map and the views in step.
 */
export const PRICING_PERMISSION = 'pricing:read';

export const PRICING_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  patient_records: ['quoted_amount'],
  quote_sends: ['quoted_total', 'quoted_lines'],
  lab_orders: ['cost'],
  specialist_consultations: ['fee'],
  inventory_items: ['cost_price'],
  inventory_movements: ['unit_cost'],
};

const PRICING_FIELDS: ReadonlySet<string> = new Set(
  Object.values(PRICING_COLUMNS).flat(),
);

/** What a hidden price looks like to the model: unmistakably not "no price". */
export const HIDDEN_PRICE = `[hidden: needs ${PRICING_PERMISSION}]`;

/** Real table names, so a WITH query cannot borrow one (see sql-policy.ts). */
const KNOWN_TABLES: ReadonlySet<string> = new Set(
  Object.keys(TABLE_PERMISSIONS),
);

const SUPERADMIN_ROLE = 'superadmin';

/** True when the user holds the permission (or none is needed). */
export function can(user: RequestUser, permission: string | null): boolean {
  if (permission === null) return true;
  if (user.role === SUPERADMIN_ROLE) return true;
  return user.permissions.includes(permission);
}

/** Tool definitions the model may see for this user. Unlabelled tools are hidden. */
export function toolsFor(
  user: RequestUser,
): OpenAI.ChatCompletionFunctionTool[] {
  return AGENT_TOOLS.filter((tool) => {
    const permission = TOOL_PERMISSIONS[tool.function.name];
    return permission !== undefined && can(user, permission);
  });
}

/** Why the user may not run this tool, or null when they may. */
export function toolDenial(user: RequestUser, name: string): string | null {
  const permission = TOOL_PERMISSIONS[name];
  if (permission === undefined) return `Unknown tool "${name}".`;
  if (can(user, permission)) return null;
  return missingPermissionMessage([permission as string], user);
}

// ── Sensitive data ───────────────────────────────────────────────────────────

/**
 * Fragments that mark a column as a credential, wherever they appear in its
 * name (password_hash, password_setup_token_hash, refresh_token, …). Matching
 * fragments rather than exact names means an alias or a new column cannot
 * slip past.
 */
const SENSITIVE_FRAGMENT =
  /password|passwd|token|secret|otp|_hash\b|api_key|private_key|encryption_key|recovery_code/i;

/** True for a column the assistant must never see, whatever the role. */
export const isSensitiveColumn = (name: string): boolean =>
  SENSITIVE_FRAGMENT.test(name);

/** Plain data objects only: Date, Decimal and class instances are kept whole. */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);

/** Replace credential-like fields anywhere in a result with a placeholder. */
export function redactSensitiveFields<T>(data: T): T {
  if (Array.isArray(data)) return data.map(redactSensitiveFields) as T;
  if (isPlainObject(data)) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) =>
        isSensitiveColumn(k)
          ? [k, '[REDACTED]']
          : [k, redactSensitiveFields(v)],
      ),
    ) as T;
  }
  return data;
}

/** Replace price and cost fields anywhere in a tool result for a user without pricing:read. */
export function hidePricingFields<T>(data: T): T {
  if (Array.isArray(data)) return data.map(hidePricingFields) as T;
  if (isPlainObject(data)) {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) =>
        PRICING_FIELDS.has(k) && v !== null && v !== undefined
          ? [k, HIDDEN_PRICE]
          : [k, hidePricingFields(v)],
      ),
    ) as T;
  }
  return data;
}

// ── Raw SQL ──────────────────────────────────────────────────────────────────

const SELECT_ONLY = /^\s*SELECT\b/i;

/** Supabase's auth schema: accounts and sessions of every clinic. */
const AUTH_SCHEMA = /\bauth\s*\.\s*(users|sessions|identities)\b/i;

/** Anything credential-like by name fragment, or the auth schema. */
const SENSITIVE_SQL = new RegExp(
  `${SENSITIVE_FRAGMENT.source}|${AUTH_SCHEMA.source}`,
  'i',
);

/** One table the SQL reads, what reading it needs, and whether this user has it. */
export interface TableCheck {
  table: string;
  /** Permission key, null when the table is open to all, undefined when unknown. */
  permission: string | null | undefined;
  granted: boolean;
}

export interface SqlCheck {
  /** Why the SQL may not run, or null when it may. */
  denial: string | null;
  /** Empty when the SQL was refused before its tables could be read. */
  tables: TableCheck[];
}

/**
 * Whether the user may run this SQL through query_database, and the per-table
 * check behind the answer (logged by the tool). The shape of the statement
 * (single read-only SELECT, known functions, public tables) is judged from its
 * syntax tree in sql-policy.ts; this adds the credential-column rule and the
 * per-table permission check.
 */
export function checkSql(user: RequestUser, sql: string): SqlCheck {
  if (!SELECT_ONLY.test(sql)) {
    return { denial: 'Only SELECT queries are allowed.', tables: [] };
  }
  if (SENSITIVE_SQL.test(sql)) {
    return {
      denial: 'Query references restricted columns or schemas.',
      tables: [],
    };
  }

  const analysis = analyzeSelect(sql, KNOWN_TABLES);
  if (!analysis.ok) return { denial: analysis.reason, tables: [] };

  const tables: TableCheck[] = analysis.tables.map((table) => {
    const permission = TABLE_PERMISSIONS[table];
    return {
      table,
      permission,
      granted: permission !== undefined && can(user, permission),
    };
  });

  const unknown = tables.filter((t) => t.permission === undefined);
  if (unknown.length > 0) {
    return {
      denial: `Query references tables the assistant may not read: ${unknown.map((t) => t.table).join(', ')}.`,
      tables,
    };
  }

  const missing = [
    ...new Set(
      tables
        .filter((t) => !t.granted)
        .map((t) => t.permission)
        .filter((p): p is string => typeof p === 'string'),
    ),
  ];
  return {
    denial: missing.length > 0 ? missingPermissionMessage(missing, user) : null,
    tables,
  };
}

/** Why the user may not run this SQL through query_database, or null when they may. */
export function sqlDenial(user: RequestUser, sql: string): string | null {
  return checkSql(user, sql).denial;
}

// ── Describing permissions to the model and the user ────────────────────────

export interface PermissionLine {
  key: string;
  label: string;
}

const LABELS = new Map<string, string>(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label])),
);

/** Human label of a permission key, falling back to the key itself. */
export const permissionLabel = (key: string): string => LABELS.get(key) ?? key;

/** The catalog split into what this user holds and what they lack. */
export function describeAccess(user: RequestUser): {
  granted: PermissionLine[];
  denied: PermissionLine[];
} {
  const granted: PermissionLine[] = [];
  const denied: PermissionLine[] = [];
  for (const group of PERMISSION_GROUPS) {
    for (const p of group.permissions) {
      (can(user, p.key) ? granted : denied).push({
        key: p.key,
        label: p.label,
      });
    }
  }
  return { granted, denied };
}

function missingPermissionMessage(
  permissions: string[],
  user: RequestUser,
): string {
  const list = permissions
    .map((p) => `${p} (${permissionLabel(p)})`)
    .join(', ');
  return `Your role "${user.role}" lacks the permission${permissions.length > 1 ? 's' : ''}: ${list}. A clinic administrator can grant it on the Roles page.`;
}

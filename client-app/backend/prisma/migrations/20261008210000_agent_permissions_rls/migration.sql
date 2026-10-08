-- The AI assistant's SQL tool: role permissions enforced by the database.
--
-- The assistant runs the model's SELECT as the role `dental_agent` inside a
-- read-only transaction, with the caller's permission keys in the
-- transaction-local setting app.agent_permissions ('*' for platform admins).
-- Every clinic table carries a RESTRICTIVE policy for that role that calls
-- app.agent_may('<permission>'), which raises unless the key is present. So
-- even if the application-side check (src/patient/agent/sql-policy.ts) were
-- bypassed, PostgreSQL refuses the read. Clinic and branch isolation come from
-- the existing tenant_isolation policies, which apply to every role.
--
-- The REST API keeps running as dental_app and is not affected: dental_app is
-- granted dental_agent WITH INHERIT FALSE, so these policies never apply to it.
--
-- Keep the table -> permission list identical to TABLE_PERMISSIONS in
-- src/patient/agent/agent-access.ts; agent-permissions-migration.spec.ts fails
-- when they drift.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261008210000_agent_permissions_rls/migration.sql

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dental_agent') THEN
        CREATE ROLE dental_agent NOLOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END $$;

-- Read-only: only the tables the assistant may query. No sequences, no writes,
-- and no default privileges, so a new table is invisible until listed here.
GRANT USAGE ON SCHEMA public TO dental_agent;
GRANT USAGE ON SCHEMA app TO dental_agent;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_agent;
GRANT SELECT ON
    organizations, branches, clinic_profile,
    appointments, appointment_slots,
    patient_profiles, patient_records, patient_documents,
    users,
    treatment_invoices, invoice_line_items, invoice_payments,
    expenses, expense_payments,
    inventory_items, inventory_movements,
    notifications, roles, role_permissions, audit_logs
TO dental_agent;

-- dental_app may switch into dental_agent for a transaction, but does not
-- inherit from it, so the agent policies below never apply to dental_app.
GRANT dental_agent TO dental_app WITH SET TRUE, INHERIT FALSE;

-- True when the transaction's permission list holds `required`; raises otherwise.
-- Only the agent policies call it, so an unset list means the application
-- forgot to pass one: fail closed.
CREATE OR REPLACE FUNCTION app.agent_may(required TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
    granted TEXT := current_setting('app.agent_permissions', true);
BEGIN
    IF granted IS NULL OR granted = '' THEN
        RAISE EXCEPTION 'agent permissions are not set for this transaction'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF granted = '*' OR position(',' || required || ',' IN ',' || granted || ',') > 0 THEN
        RETURN true;
    END IF;
    RAISE EXCEPTION 'permission % is required to read this table', required
        USING ERRCODE = 'insufficient_privilege';
END $$;

GRANT EXECUTE ON FUNCTION app.agent_may(TEXT) TO dental_agent;

-- One restrictive SELECT policy per table, for dental_agent only.
DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['appointments',        'appointments:read'],
        ['appointment_slots',   'appointments:read'],
        ['patient_profiles',    'patients:read'],
        ['patient_records',     'records:read'],
        ['patient_documents',   'documents:read'],
        ['users',               'staff:read'],
        ['treatment_invoices',  'billing:read'],
        ['invoice_line_items',  'billing:read'],
        ['invoice_payments',    'billing:read'],
        ['expenses',            'expenses:read'],
        ['expense_payments',    'expenses:read'],
        ['inventory_items',     'inventory:read'],
        ['inventory_movements', 'inventory:read'],
        ['notifications',       'staff:manage'],
        ['roles',               'roles:manage'],
        ['role_permissions',    'roles:manage'],
        ['audit_logs',          'staff:manage']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

COMMIT;

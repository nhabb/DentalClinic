-- Branch-level access on top of organization-level RLS.
--
-- Staff can now be confined to one branch (users.restrict_to_branch + users.branch_id).
-- The backend exposes that as two settings instead of the old app.current_branch:
--
--   app.home_branch   default branch for the user's new rows (app.default_branch_id())
--   app.branch_scope  when set, only rows of this branch (or organization-wide rows
--                     with branch_id NULL) are visible and writable
--
-- Organization admins are never confined (the backend leaves app.branch_scope empty).
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261008150000_branch_scope_rls/migration.sql
-- Revert with: node scripts/apply-sql.js prisma/migrations/20261008150000_branch_scope_rls/down.sql

BEGIN;

ALTER TABLE "users" ADD COLUMN "restrict_to_branch" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION app.home_branch_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.home_branch', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION app.branch_scope_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.branch_scope', true), '')::bigint
$$;

-- Same function (same OID, so column defaults keep pointing at it), new source setting.
CREATE OR REPLACE FUNCTION app.default_branch_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        app.home_branch_id(),
        (SELECT b.id FROM public.branches b
          WHERE b.organization_id = app.current_org_id() AND b.is_default AND b.is_active
          ORDER BY b.id LIMIT 1),
        (SELECT b.id FROM public.branches b
          WHERE b.organization_id = app.current_org_id() AND b.is_active
          ORDER BY b.id LIMIT 1)
    )
$$;

DROP FUNCTION IF EXISTS app.current_branch_id();

-- Tables with a branch column get the branch clause on top of the tenant clause.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'appointment_slots', 'appointments', 'inventory_items', 'treatment_invoices',
        'expenses', 'patient_records', 'patient_documents', 'clinic_profile'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
            'USING (app.is_system() OR ("organization_id" = app.current_org_id() '
            '  AND (app.branch_scope_id() IS NULL OR "branch_id" IS NULL OR "branch_id" = app.branch_scope_id()))) '
            'WITH CHECK (app.is_system() OR ("organization_id" = app.current_org_id() '
            '  AND (app.branch_scope_id() IS NULL OR "branch_id" IS NULL OR "branch_id" = app.branch_scope_id())))',
            t);
    END LOOP;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;

COMMIT;

-- Reverts 20261008150000_branch_scope_rls: organization-only policies, old setting name.

BEGIN;

CREATE OR REPLACE FUNCTION app.current_branch_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_branch', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION app.default_branch_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        app.current_branch_id(),
        (SELECT b.id FROM public.branches b
          WHERE b.organization_id = app.current_org_id() AND b.is_default AND b.is_active
          ORDER BY b.id LIMIT 1),
        (SELECT b.id FROM public.branches b
          WHERE b.organization_id = app.current_org_id() AND b.is_active
          ORDER BY b.id LIMIT 1)
    )
$$;

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
            'USING (app.is_system() OR "organization_id" = app.current_org_id()) '
            'WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id())', t);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS app.branch_scope_id();
DROP FUNCTION IF EXISTS app.home_branch_id();
ALTER TABLE "users" DROP COLUMN IF EXISTS "restrict_to_branch";

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;

COMMIT;

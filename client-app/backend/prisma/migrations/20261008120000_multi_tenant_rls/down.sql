-- Reverts 20261008120000_multi_tenant_rls. Data in organizations/branches is lost;
-- tenant columns are dropped from every table. The global SKU uniqueness is restored.

BEGIN;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'organizations', 'branches', 'users', 'patient_profiles', 'appointment_slots',
        'appointments', 'patient_records', 'patient_documents', 'inventory_items',
        'inventory_movements', 'notifications', 'audit_logs', 'clinic_profile', 'expenses',
        'expense_payments', 'treatment_invoices', 'invoice_line_items', 'invoice_payments'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END LOOP;
END $$;

DROP INDEX IF EXISTS "inventory_items_branch_id_sku_key";
ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "branch_id";
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

ALTER TABLE "appointment_slots"  DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "appointments"       DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "treatment_invoices" DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "expenses"           DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "patient_records"    DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "patient_documents"  DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "clinic_profile"     DROP COLUMN IF EXISTS "branch_id";
ALTER TABLE "users"              DROP COLUMN IF EXISTS "branch_id";

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'patient_profiles', 'appointment_slots', 'appointments', 'patient_records',
        'patient_documents', 'inventory_items', 'inventory_movements', 'notifications',
        'audit_logs', 'clinic_profile', 'expenses', 'expense_payments',
        'treatment_invoices', 'invoice_line_items', 'invoice_payments'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS "organization_id"', t);
    END LOOP;
END $$;

DROP TABLE IF EXISTS "branches";
DROP TABLE IF EXISTS "organizations";

DROP FUNCTION IF EXISTS app.default_branch_id();
DROP FUNCTION IF EXISTS app.current_branch_id();
DROP FUNCTION IF EXISTS app.current_org_id();
DROP FUNCTION IF EXISTS app.is_system();
DROP SCHEMA IF EXISTS app;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dental_app') THEN
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM dental_app;
        ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM dental_app;
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dental_app;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM dental_app;
        REVOKE USAGE ON SCHEMA public FROM dental_app;
        REVOKE dental_app FROM postgres;
        DROP ROLE dental_app;
    END IF;
END $$;

COMMIT;

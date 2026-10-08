-- Multi-tenancy + row-level security.
--
--   organizations  = tenants (one dental business, e.g. "BrightSmile")
--   branches       = that business's clinics (Beirut, Tyre, ...)
--
-- Every tenant-owned table gets `organization_id`; location-bound tables also get
-- `branch_id`. Both default to the request's tenant through the app.* helper
-- functions, which read per-connection settings the backend sets for each request:
--
--   app.current_org     bigint as text   tenant of the current request ('' = none)
--   app.current_branch  bigint as text   branch of the current user ('' = none)
--   app.bypass_rls      'on' | 'off'     platform-level access (superadmin, auth lookups)
--
-- Row-level security is enabled and FORCED on every table. The policies only let a
-- connection see rows whose organization_id equals app.current_org (or everything
-- when app.bypass_rls = 'on'). With no tenant set, every table is empty: fail closed.
--
-- The Supabase `postgres` login has BYPASSRLS, so RLS alone would not protect
-- anything. The backend therefore switches each connection to the `dental_app`
-- role (NOBYPASSRLS) created below. Prisma CLI / dashboard sessions stay on
-- `postgres` and still see everything, which is what migrations and support need.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261008120000_multi_tenant_rls/migration.sql
-- Revert with: node scripts/apply-sql.js prisma/migrations/20261008120000_multi_tenant_rls/down.sql

BEGIN;

-- ─── 1. Tenant tables ────────────────────────────────────────────────────────

CREATE TABLE "organizations" (
    "id"          BIGSERIAL NOT NULL,
    "name"        VARCHAR NOT NULL,
    "slug"        VARCHAR NOT NULL,
    "legal_name"  VARCHAR,
    "email"       VARCHAR,
    "phone"       VARCHAR,
    "website_url" TEXT,
    "logo_url"    TEXT,
    "description" TEXT,
    "timezone"    VARCHAR NOT NULL DEFAULT 'Asia/Beirut',
    "currency"    VARCHAR NOT NULL DEFAULT 'USD',
    "is_active"   BOOLEAN NOT NULL DEFAULT true,
    "settings"    JSONB NOT NULL DEFAULT '{}',
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "idx_organizations_is_active" ON "organizations"("is_active");

-- ─── 2. Session helpers (schema `app`) ───────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_org', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION app.current_branch_id() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_branch', true), '')::bigint
$$;

CREATE OR REPLACE FUNCTION app.is_system() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'on'
$$;

CREATE TABLE "branches" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "name"            VARCHAR NOT NULL,
    "code"            VARCHAR,
    "address"         TEXT,
    "city"            VARCHAR,
    "governate"       VARCHAR,
    "phone"           VARCHAR,
    "email"           VARCHAR,
    "opening_hours"   TEXT,
    "timezone"        VARCHAR,
    "is_default"      BOOLEAN NOT NULL DEFAULT false,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "branches_organization_id_name_key" ON "branches"("organization_id", "name");
CREATE INDEX "idx_branches_org" ON "branches"("organization_id");
-- One default branch per organization (partial index; not representable in Prisma).
CREATE UNIQUE INDEX "idx_branches_one_default_per_org" ON "branches"("organization_id") WHERE "is_default";

-- Branch for rows inserted without an explicit branch: the current user's branch,
-- else the organization's default branch, else its first active branch.
-- (Defined after `branches` exists because SQL function bodies are validated on creation.)
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

-- ─── 3. Backfill: everything that exists today belongs to one organization ───

INSERT INTO "organizations" ("name", "slug", "description")
VALUES ('BrightSmile Dental Clinic', 'brightsmile', 'Migrated from the single-clinic installation');

INSERT INTO "branches" ("organization_id", "name", "city", "governate", "is_default")
SELECT o.id, 'Main Branch', 'Beirut', 'Beirut', true
FROM "organizations" o WHERE o.slug = 'brightsmile';

-- ─── 4. organization_id on every tenant-owned table ─────────────────────────

DO $$
DECLARE
    org_id BIGINT := (SELECT id FROM public.organizations WHERE slug = 'brightsmile');
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'patient_profiles', 'appointment_slots', 'appointments', 'patient_records',
        'patient_documents', 'inventory_items', 'inventory_movements', 'notifications',
        'audit_logs', 'clinic_profile', 'expenses', 'expense_payments',
        'treatment_invoices', 'invoice_line_items', 'invoice_payments'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN "organization_id" BIGINT', t);
        EXECUTE format('UPDATE public.%I SET "organization_id" = %s', t, org_id);
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN "organization_id" SET NOT NULL, '
                       'ALTER COLUMN "organization_id" SET DEFAULT app.current_org_id()', t);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY ("organization_id") '
                       'REFERENCES public.organizations("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
                       t, t || '_organization_id_fkey');
    END LOOP;

    -- users: nullable, because platform-level superadmins belong to no tenant.
    ALTER TABLE public.users ADD COLUMN "organization_id" BIGINT;
    ALTER TABLE public.users ADD COLUMN "branch_id" BIGINT;
    EXECUTE format('UPDATE public.users SET "organization_id" = %s WHERE role <> ''superadmin''', org_id);
    ALTER TABLE public.users ALTER COLUMN "organization_id" SET DEFAULT app.current_org_id();
    ALTER TABLE public.users ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES public.organizations("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
    ALTER TABLE public.users ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id")
        REFERENCES public.branches("id") ON DELETE SET NULL ON UPDATE NO ACTION;
END $$;

CREATE INDEX "idx_patient_profiles_org"    ON "patient_profiles"("organization_id");
CREATE INDEX "idx_slots_org"               ON "appointment_slots"("organization_id");
CREATE INDEX "idx_appointments_org"        ON "appointments"("organization_id");
CREATE INDEX "idx_patient_records_org"     ON "patient_records"("organization_id");
CREATE INDEX "idx_patient_documents_org"   ON "patient_documents"("organization_id");
CREATE INDEX "idx_inventory_items_org"     ON "inventory_items"("organization_id");
CREATE INDEX "idx_inventory_movements_org" ON "inventory_movements"("organization_id");
CREATE INDEX "idx_notifications_org"       ON "notifications"("organization_id");
CREATE INDEX "idx_audit_logs_org"          ON "audit_logs"("organization_id");
CREATE INDEX "idx_clinic_profile_org"      ON "clinic_profile"("organization_id");
CREATE INDEX "idx_expenses_org"            ON "expenses"("organization_id");
CREATE INDEX "idx_expense_payments_org"    ON "expense_payments"("organization_id");
CREATE INDEX "idx_treatment_invoices_org"  ON "treatment_invoices"("organization_id");
CREATE INDEX "idx_invoice_line_items_org"  ON "invoice_line_items"("organization_id");
CREATE INDEX "idx_invoice_payments_org"    ON "invoice_payments"("organization_id");
CREATE INDEX "idx_users_org"               ON "users"("organization_id");
CREATE INDEX "idx_users_org_role"          ON "users"("organization_id", "role");

-- ─── 5. branch_id on location-bound tables ──────────────────────────────────

DO $$
DECLARE
    branch_id BIGINT := (SELECT b.id FROM public.branches b
                           JOIN public.organizations o ON o.id = b.organization_id
                          WHERE o.slug = 'brightsmile' AND b.is_default);
    t TEXT;
BEGIN
    -- Required: a slot, an appointment and a stock line always happen at a branch.
    FOREACH t IN ARRAY ARRAY['appointment_slots', 'appointments', 'inventory_items'] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN "branch_id" BIGINT', t);
        EXECUTE format('UPDATE public.%I SET "branch_id" = %s', t, branch_id);
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN "branch_id" SET NOT NULL, '
                       'ALTER COLUMN "branch_id" SET DEFAULT app.default_branch_id()', t);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY ("branch_id") '
                       'REFERENCES public.branches("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
                       t, t || '_branch_id_fkey');
    END LOOP;

    -- Optional: attribution only (organization-wide rows keep NULL).
    FOREACH t IN ARRAY ARRAY['treatment_invoices', 'expenses', 'patient_records', 'patient_documents'] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN "branch_id" BIGINT DEFAULT app.default_branch_id()', t);
        EXECUTE format('UPDATE public.%I SET "branch_id" = %s', t, branch_id);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY ("branch_id") '
                       'REFERENCES public.branches("id") ON DELETE SET NULL ON UPDATE NO ACTION',
                       t, t || '_branch_id_fkey');
    END LOOP;

    -- clinic_profile: NULL = organization-wide profile, otherwise a branch's details.
    ALTER TABLE public.clinic_profile ADD COLUMN "branch_id" BIGINT;
    ALTER TABLE public.clinic_profile ADD CONSTRAINT "clinic_profile_branch_id_fkey" FOREIGN KEY ("branch_id")
        REFERENCES public.branches("id") ON DELETE SET NULL ON UPDATE NO ACTION;
END $$;

CREATE INDEX "idx_slots_org_branch_date"        ON "appointment_slots"("organization_id", "branch_id", "slot_date");
CREATE INDEX "idx_appointments_org_branch_date" ON "appointments"("organization_id", "branch_id", "appointment_date");
CREATE INDEX "idx_inventory_items_org_branch"   ON "inventory_items"("organization_id", "branch_id");
CREATE INDEX "idx_expenses_org_branch"          ON "expenses"("organization_id", "branch_id");
CREATE INDEX "idx_treatment_invoices_org_branch" ON "treatment_invoices"("organization_id", "branch_id");

-- Inventory SKUs are unique per branch now (the same product can be stocked at
-- several branches), not globally.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.inventory_items'::regclass AND contype = 'u' LOOP
        EXECUTE format('ALTER TABLE public.inventory_items DROP CONSTRAINT %I', r.conname);
    END LOOP;
    FOR r IN SELECT indexname FROM pg_indexes
              WHERE schemaname = 'public' AND tablename = 'inventory_items'
                AND indexdef ILIKE 'CREATE UNIQUE INDEX%(sku)' LOOP
        EXECUTE format('DROP INDEX public.%I', r.indexname);
    END LOOP;
END $$;
CREATE UNIQUE INDEX "inventory_items_branch_id_sku_key" ON "inventory_items"("branch_id", "sku");

-- ─── 6. Row-level security ───────────────────────────────────────────────────

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'branches', 'users', 'patient_profiles', 'appointment_slots', 'appointments',
        'patient_records', 'patient_documents', 'inventory_items', 'inventory_movements',
        'notifications', 'audit_logs', 'clinic_profile', 'expenses', 'expense_payments',
        'treatment_invoices', 'invoice_line_items', 'invoice_payments'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
            'USING (app.is_system() OR "organization_id" = app.current_org_id()) '
            'WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id())', t);
    END LOOP;
END $$;

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "organizations";
CREATE POLICY tenant_isolation ON "organizations" FOR ALL
    USING (app.is_system() OR "id" = app.current_org_id())
    WITH CHECK (app.is_system() OR "id" = app.current_org_id());

-- ─── 7. Application role (subject to RLS) ────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dental_app') THEN
        CREATE ROLE dental_app NOLOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dental_app;
GRANT USAGE ON SCHEMA app TO dental_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dental_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dental_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_app;
-- Tables and sequences created by future migrations (run as postgres) stay usable.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dental_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dental_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO dental_app;
-- Let the backend's login role switch into it with SET ROLE.
GRANT dental_app TO postgres WITH SET TRUE, INHERIT FALSE;

COMMIT;

-- Outside specialists helping on cases, and lab work for cases.
--
-- specialists               per-clinic directory of outside doctors
-- specialist_consultations  a case on which a specialist was asked to help
-- dental_labs               per-clinic directory of dental laboratories
-- lab_orders                work sent to a lab for a case (crown, denture, ...)
--
-- Consultations and lab orders belong to a patient and optionally to an
-- appointment and a clinical record. They carry a branch like invoices do, so
-- branch-restricted staff only see their branch's cases.
--
-- Access: new permissions specialists:read/write and lab:read/write (catalog in
-- src/shared/authorization/permissions.ts); the built-in doctor and secretary
-- roles of every clinic receive them below. The AI assistant may read the four
-- tables under the same keys (agent_permission policies for dental_agent).
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261009000000_specialists_and_lab/migration.sql

BEGIN;

-- Tables -----------------------------------------------------------------------

CREATE TABLE "specialists" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "name"            VARCHAR NOT NULL,
    "specialty"       VARCHAR NOT NULL,
    "phone"           VARCHAR,
    "email"           VARCHAR,
    "clinic_name"     VARCHAR,
    "notes"           TEXT,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "specialists_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "specialists_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "idx_specialists_org" ON "specialists"("organization_id");

CREATE TABLE "specialist_consultations" (
    "id"                BIGSERIAL NOT NULL,
    "organization_id"   BIGINT NOT NULL DEFAULT app.current_org_id(),
    "branch_id"         BIGINT DEFAULT app.default_branch_id(),
    "patient_id"        BIGINT NOT NULL,
    "specialist_id"     BIGINT NOT NULL,
    "appointment_id"    BIGINT,
    "record_id"         BIGINT,
    "requested_by"      BIGINT,
    "status"            VARCHAR NOT NULL DEFAULT 'requested',
    "consultation_date" DATE,
    "reason"            TEXT NOT NULL,
    "outcome"           TEXT,
    "fee"               DECIMAL(10,2),
    "notes"             TEXT,
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "specialist_consultations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "specialist_consultations_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "specialist_consultations_branch_id_fkey" FOREIGN KEY ("branch_id")
        REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "specialist_consultations_patient_id_fkey" FOREIGN KEY ("patient_id")
        REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "specialist_consultations_specialist_id_fkey" FOREIGN KEY ("specialist_id")
        REFERENCES "specialists"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "specialist_consultations_appointment_id_fkey" FOREIGN KEY ("appointment_id")
        REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "specialist_consultations_record_id_fkey" FOREIGN KEY ("record_id")
        REFERENCES "patient_records"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "specialist_consultations_requested_by_fkey" FOREIGN KEY ("requested_by")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX "idx_specialist_consultations_org" ON "specialist_consultations"("organization_id");
CREATE INDEX "idx_specialist_consultations_org_branch" ON "specialist_consultations"("organization_id", "branch_id");
CREATE INDEX "idx_specialist_consultations_patient" ON "specialist_consultations"("patient_id");
CREATE INDEX "idx_specialist_consultations_specialist" ON "specialist_consultations"("specialist_id");
CREATE INDEX "idx_specialist_consultations_status" ON "specialist_consultations"("status");

CREATE TABLE "dental_labs" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "name"            VARCHAR NOT NULL,
    "phone"           VARCHAR,
    "email"           VARCHAR,
    "address"         TEXT,
    "notes"           TEXT,
    "is_active"       BOOLEAN NOT NULL DEFAULT true,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dental_labs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dental_labs_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "idx_dental_labs_org" ON "dental_labs"("organization_id");

CREATE TABLE "lab_orders" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "branch_id"       BIGINT DEFAULT app.default_branch_id(),
    "patient_id"      BIGINT NOT NULL,
    "lab_id"          BIGINT NOT NULL,
    "appointment_id"  BIGINT,
    "record_id"       BIGINT,
    "ordered_by"      BIGINT,
    "work_type"       VARCHAR NOT NULL,
    "description"     TEXT,
    "tooth_numbers"   VARCHAR,
    "shade"           VARCHAR,
    "status"          VARCHAR NOT NULL DEFAULT 'ordered',
    "sent_at"         DATE,
    "due_at"          DATE,
    "received_at"     DATE,
    "fitted_at"       DATE,
    "cost"            DECIMAL(10,2),
    "notes"           TEXT,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lab_orders_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "lab_orders_branch_id_fkey" FOREIGN KEY ("branch_id")
        REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "lab_orders_patient_id_fkey" FOREIGN KEY ("patient_id")
        REFERENCES "patient_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "lab_orders_lab_id_fkey" FOREIGN KEY ("lab_id")
        REFERENCES "dental_labs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "lab_orders_appointment_id_fkey" FOREIGN KEY ("appointment_id")
        REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "lab_orders_record_id_fkey" FOREIGN KEY ("record_id")
        REFERENCES "patient_records"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT "lab_orders_ordered_by_fkey" FOREIGN KEY ("ordered_by")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX "idx_lab_orders_org" ON "lab_orders"("organization_id");
CREATE INDEX "idx_lab_orders_org_branch" ON "lab_orders"("organization_id", "branch_id");
CREATE INDEX "idx_lab_orders_patient" ON "lab_orders"("patient_id");
CREATE INDEX "idx_lab_orders_lab" ON "lab_orders"("lab_id");
CREATE INDEX "idx_lab_orders_status" ON "lab_orders"("status");
CREATE INDEX "idx_lab_orders_due" ON "lab_orders"("due_at");

-- Row-level security: tenant (directories) and tenant + branch (cases) -----------

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['specialists', 'dental_labs'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
            'USING (app.is_system() OR "organization_id" = app.current_org_id()) '
            'WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id())', t);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['specialist_consultations', 'lab_orders'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
            'USING (app.is_system() OR ("organization_id" = app.current_org_id() '
            '  AND (app.branch_scope_id() IS NULL OR "branch_id" IS NULL OR "branch_id" = app.branch_scope_id()))) '
            'WITH CHECK (app.is_system() OR ("organization_id" = app.current_org_id() '
            '  AND (app.branch_scope_id() IS NULL OR "branch_id" IS NULL OR "branch_id" = app.branch_scope_id())))',
            t);
    END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON specialists, specialist_consultations, dental_labs, lab_orders TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE specialists_id_seq, specialist_consultations_id_seq, dental_labs_id_seq, lab_orders_id_seq TO dental_app;

-- The AI assistant: read-only, under the same permission keys ------------------

GRANT SELECT ON
    specialists, specialist_consultations, dental_labs, lab_orders
TO dental_agent;

DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['specialists',              'specialists:read'],
        ['specialist_consultations', 'specialists:read'],
        ['dental_labs',              'lab:read'],
        ['lab_orders',               'lab:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

-- Built-in doctor and secretary roles get the new permissions ------------------
-- (admin always holds every permission; custom roles are the clinic's choice)

INSERT INTO role_permissions (role_id, organization_id, permission)
SELECT r.id, r.organization_id, p.key
FROM roles r
CROSS JOIN unnest(ARRAY['specialists:read', 'specialists:write', 'lab:read', 'lab:write']) AS p(key)
WHERE r.is_system AND r.key IN ('doctor', 'secretary')
ON CONFLICT DO NOTHING;

COMMIT;

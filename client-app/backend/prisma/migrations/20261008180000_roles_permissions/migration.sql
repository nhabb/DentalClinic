-- Per-clinic roles and permissions.
--
-- roles             one row per role of an organization (admin, doctor, secretary,
--                   patient are created by the backend; clinics may add their own)
-- role_permissions  which permission keys (see src/shared/authorization/permissions.ts)
--                   a role holds; organization_id is denormalised for RLS
--
-- users.role keeps holding the role *key*; the backend validates it against this table.
-- Default roles are not inserted here: the backend creates them for any organization
-- that has none (RolesService.ensureDefaults), so the catalog has one source of truth.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261008180000_roles_permissions/migration.sql

BEGIN;

CREATE TABLE "roles" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "key"             VARCHAR NOT NULL,
    "name"            VARCHAR NOT NULL,
    "description"     TEXT,
    "is_system"       BOOLEAN NOT NULL DEFAULT false,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "roles_organization_id_key_key" ON "roles"("organization_id", "key");
CREATE INDEX "idx_roles_org" ON "roles"("organization_id");

CREATE TABLE "role_permissions" (
    "role_id"         BIGINT NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "permission"      VARCHAR NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission"),
    CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id")
        REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "role_permissions_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "idx_role_permissions_org" ON "role_permissions"("organization_id");

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['roles', 'role_permissions'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
            'USING (app.is_system() OR "organization_id" = app.current_org_id()) '
            'WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id())', t);
    END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "roles", "role_permissions" TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE "roles_id_seq" TO dental_app;

COMMIT;

-- The assistant's role may read staff accounts but never their credentials.
--
-- Until now dental_agent had SELECT on the whole users table and credentials
-- were hidden by name: the SQL text may not mention "password", and result
-- fields named like a credential are redacted. PostgreSQL can return a row
-- without naming any column (SELECT u FROM users u, to_jsonb(u), row::text),
-- which passed both checks and exposed password_hash and
-- password_setup_token_hash to the model.
--
-- Column-level privileges close that at the source: a whole-row reference,
-- SELECT *, to_jsonb(u) or any mention of an unlisted column now fails inside
-- the database with "permission denied for table users", whatever the spelling.
--
-- A column added to users later is invisible to the assistant until it is
-- listed here on purpose. agent-users-column-grants.spec.ts fails when this
-- list and schema.prisma drift (every non-credential column must be listed,
-- no credential column may be). must_set_password is a flag, not a secret, but
-- the SQL text rule refuses any query that says "password", so granting it
-- would be dead weight.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261013190000_agent_users_column_grants/migration.sql

BEGIN;

REVOKE SELECT ON public.users FROM dental_agent;

GRANT SELECT (
    id, organization_id, branch_id, restrict_to_branch,
    email, first_name, last_name, phone, date_of_birth, gender, address,
    role, is_active, avatar_url,
    created_at, updated_at
) ON public.users TO dental_agent;

COMMIT;

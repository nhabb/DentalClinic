-- The AI assistant's SQL tool: patient accounts in `users` need patients:read.
--
-- `users` holds staff and patient accounts alike. Reading it through the
-- assistant needs staff:read (agent_permission policy), but a role that may
-- see staff is not necessarily allowed to see patients. This second
-- restrictive policy, for dental_agent only, hides patient rows unless the
-- transaction's permission list also holds patients:read. It filters rather
-- than raises, so staff listings keep working.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261008230000_agent_users_patient_rows/migration.sql

BEGIN;

-- Like app.agent_may(), but a plain true/false for row filters.
CREATE OR REPLACE FUNCTION app.agent_has(required TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        current_setting('app.agent_permissions', true) = '*'
        OR position(',' || required || ',' IN ',' || current_setting('app.agent_permissions', true) || ',') > 0,
        false);
$$;

GRANT EXECUTE ON FUNCTION app.agent_has(TEXT) TO dental_agent;

DROP POLICY IF EXISTS agent_patient_rows ON public.users;
CREATE POLICY agent_patient_rows ON public.users AS RESTRICTIVE FOR SELECT TO dental_agent
    USING (role <> 'patient' OR app.agent_has('patients:read'));

COMMIT;

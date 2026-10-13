-- Reverse of migration.sql: back to a whole-table grant (credentials exposed again).
BEGIN;
REVOKE SELECT ON public.users FROM dental_agent;
GRANT SELECT ON public.users TO dental_agent;
COMMIT;

-- Reverse of migration.sql: drop the usage log.
BEGIN;
DROP TABLE IF EXISTS public.agent_usage;
COMMIT;

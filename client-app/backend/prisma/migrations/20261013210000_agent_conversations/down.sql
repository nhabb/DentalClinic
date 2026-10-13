-- Reverse of migration.sql: drop the server-side chat store.
BEGIN;
DROP TABLE IF EXISTS public.agent_conversations;
COMMIT;

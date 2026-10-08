BEGIN;
DROP POLICY IF EXISTS agent_patient_rows ON public.users;
DROP FUNCTION IF EXISTS app.agent_has(TEXT);
COMMIT;

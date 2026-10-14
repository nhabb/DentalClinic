-- Quote amounts are prices: the assistant sees them only with pricing:read.
--
-- Same mechanism as 20261013200000_pricing_permission_and_agent_views: the SQL
-- tool's role reads a view in schema `agent` instead of the table, and the
-- view blanks the price columns unless the caller holds pricing:read. The view
-- owner (dental_agent_views) is held to the same table permission as the app
-- (billing:read) by a restrictive policy.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261014200100_quotes_agent_pricing_views/migration.sql

BEGIN;

GRANT SELECT ON public.quotes, public.quote_items TO dental_agent_views;
-- Changing a view's owner needs the new owner to hold CREATE on the schema
-- (idempotent; also carried by the migration that created the schema).
GRANT CREATE, USAGE ON SCHEMA agent TO dental_agent_views;

DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['quotes',      'billing:read'],
        ['quote_items', 'billing:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_views_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_views_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent_views '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

CREATE OR REPLACE VIEW agent.quotes AS
SELECT id, organization_id, branch_id, patient_id, version, supersedes_id, status, valid_until,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_total END AS quoted_total,
       notes, created_by, sent_at, accepted_at, declined_at, created_at, updated_at
FROM public.quotes;

CREATE OR REPLACE VIEW agent.quote_items AS
SELECT id, organization_id, quote_id, record_id, procedure_name, tooth_number, description,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_amount END AS quoted_amount,
       created_at
FROM public.quote_items;

ALTER VIEW agent.quotes OWNER TO dental_agent_views;
ALTER VIEW agent.quote_items OWNER TO dental_agent_views;

GRANT SELECT ON
    agent.quotes, agent.quote_items
TO dental_agent;
REVOKE SELECT ON
    public.quotes, public.quote_items
FROM dental_agent;

COMMIT;

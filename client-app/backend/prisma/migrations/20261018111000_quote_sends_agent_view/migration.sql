-- A sent plan's total and lines are prices: the assistant sees them only with
-- pricing:read. Same mechanism as 20261014200100_quotes_agent_pricing_views —
-- the SQL tool's role reads a view in schema `agent` that blanks the price
-- columns, and the view owner is held to the table's own permission
-- (billing:read) by a restrictive policy.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261018111000_quote_sends_agent_view/migration.sql

BEGIN;

GRANT SELECT ON public.quote_sends TO dental_agent_views;
GRANT CREATE, USAGE ON SCHEMA agent TO dental_agent_views;

DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['quote_sends', 'billing:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_views_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_views_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent_views '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

CREATE OR REPLACE VIEW agent.quote_sends AS
SELECT id, organization_id, quote_id, sent_by,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_total END AS quoted_total,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_lines END AS quoted_lines,
       created_at
FROM public.quote_sends;

ALTER VIEW agent.quote_sends OWNER TO dental_agent_views;

GRANT SELECT ON
    agent.quote_sends
TO dental_agent;
REVOKE SELECT ON
    public.quote_sends
FROM dental_agent;

COMMIT;

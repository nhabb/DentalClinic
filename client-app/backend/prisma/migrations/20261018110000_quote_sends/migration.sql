-- The send log: what a patient was actually handed, and when.
--
-- The treatment plan is a living list — it is meant to be changed as treatment
-- goes on — so it cannot also be the record of what was promised. This table
-- is that record: one append-only row per "Send to patient", holding the total
-- and the lines exactly as they stood at that moment.
--
-- It is deliberately granted INSERT and SELECT but never UPDATE or DELETE:
-- a dispute record that can be edited afterwards is not a record. The quote
-- itself keeps no history, which is what lets the plan stay editable.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261018110000_quote_sends/migration.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "quote_sends" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "quote_id"        BIGINT NOT NULL,
    "sent_by"         BIGINT,
    "quoted_total"    NUMERIC(10,2) NOT NULL,
    "quoted_lines"    JSONB NOT NULL,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_sends_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_sends_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "quote_sends_quote_id_fkey" FOREIGN KEY ("quote_id")
        REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "quote_sends_sent_by_fkey" FOREIGN KEY ("sent_by")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_quote_sends_quote" ON "quote_sends"("quote_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_quote_sends_org" ON "quote_sends"("organization_id");

ALTER TABLE public.quote_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_sends FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.quote_sends;
CREATE POLICY tenant_isolation ON public.quote_sends FOR ALL
    USING (app.is_system() OR "organization_id" = app.current_org_id())
    WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id());

-- Append only: no UPDATE, no DELETE, not even for the application.
GRANT SELECT, INSERT ON quote_sends TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE quote_sends_id_seq TO dental_app;

-- The assistant may read it with billing:read; the price columns are gated
-- separately by the view in schema `agent` (next migration).
GRANT SELECT ON quote_sends TO dental_agent;

DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['quote_sends', 'billing:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

COMMENT ON TABLE quote_sends IS 'One row each time a treatment plan was given to a patient: the total and the lines as they stood that day. Append-only; it is what answers "what was I told in March" once the plan has moved on.';
COMMENT ON COLUMN quote_sends.quote_id IS 'The patient plan this was a sending of.';
COMMENT ON COLUMN quote_sends.sent_by IS 'Who handed it over (users.id).';
COMMENT ON COLUMN quote_sends.quoted_total IS 'Plan total at that moment.';
COMMENT ON COLUMN quote_sends.quoted_lines IS 'The plan lines as sent: [{tooth, procedure, amount, state}].';
COMMENT ON COLUMN quote_sends.created_at IS 'When it was given to the patient.';

COMMIT;

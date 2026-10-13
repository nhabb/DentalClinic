-- Token usage of the AI assistant, one row per answered question.
--
-- What the operator console's "AI usage" page reads: tokens in and out,
-- model rounds and tool calls, per clinic and per account, so OpenAI spend
-- can be watched and attributed. Written by the API (dental_app) after each
-- chat; tenant data under the usual isolation policy. The assistant's own SQL
-- role gets no grant: usage is operator information, not something the model
-- should read or reason about.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261013220000_agent_usage/migration.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "agent_usage" (
    "id"                BIGSERIAL NOT NULL,
    "organization_id"   BIGINT NOT NULL DEFAULT app.current_org_id(),
    "user_id"           BIGINT NOT NULL,
    "model"             VARCHAR NOT NULL,
    "prompt_tokens"     INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "rounds"            INTEGER NOT NULL DEFAULT 1,
    "tool_calls"        INTEGER NOT NULL DEFAULT 0,
    "duration_ms"       INTEGER NOT NULL DEFAULT 0,
    "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_usage_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "agent_usage_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_agent_usage_org_created" ON "agent_usage"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_agent_usage_user_created" ON "agent_usage"("user_id", "created_at");

ALTER TABLE public.agent_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.agent_usage;
CREATE POLICY tenant_isolation ON public.agent_usage FOR ALL
    USING (app.is_system() OR "organization_id" = app.current_org_id())
    WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id());

GRANT SELECT, INSERT ON agent_usage TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE agent_usage_id_seq TO dental_app;

COMMENT ON TABLE agent_usage IS 'One row per AI assistant answer: tokens, rounds and tool calls, for the operator usage dashboard. Written by the API; not readable by the assistant.';
COMMENT ON COLUMN agent_usage.organization_id IS 'Clinic the asking user belongs to.';
COMMENT ON COLUMN agent_usage.user_id IS 'The account that asked.';
COMMENT ON COLUMN agent_usage.model IS 'OpenAI model name used for this answer.';
COMMENT ON COLUMN agent_usage.prompt_tokens IS 'Input tokens summed over every model round of this answer.';
COMMENT ON COLUMN agent_usage.completion_tokens IS 'Output tokens summed over every model round of this answer.';
COMMENT ON COLUMN agent_usage.rounds IS 'How many times the model was called for this answer (1 = no tools).';
COMMENT ON COLUMN agent_usage.tool_calls IS 'How many tool calls the model made for this answer.';
COMMENT ON COLUMN agent_usage.duration_ms IS 'Wall time from question to answer, milliseconds.';
COMMENT ON COLUMN agent_usage.created_at IS 'When the answer was produced.';

COMMIT;

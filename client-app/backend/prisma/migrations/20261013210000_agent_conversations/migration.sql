-- The assistant's conversations live on the server, one per signed-in person.
--
-- Until now the browser kept the chat and sent the whole history with every
-- message, so a conversation could outlive a sign-out (another person signing
-- in on the same page inherited the previous person's answers, including
-- refusals written for a different role) and a client could send invented
-- assistant turns. Now the API stores the turns itself, keyed by user, and the
-- client only ever sends the new message: there is nothing to carry over or
-- to forge.
--
-- The table is tenant data under the usual isolation policy and is written
-- only by the API (dental_app). The assistant's own SQL role gets no grant: a
-- user cannot read anyone's conversation, including their own, through SQL.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261013210000_agent_conversations/migration.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "agent_conversations" (
    "id"              BIGSERIAL NOT NULL,
    "organization_id" BIGINT NOT NULL DEFAULT app.current_org_id(),
    "user_id"         BIGINT NOT NULL,
    "messages"        JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_conversations_user_id_key" UNIQUE ("user_id"),
    CONSTRAINT "agent_conversations_organization_id_fkey" FOREIGN KEY ("organization_id")
        REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "agent_conversations_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX IF NOT EXISTS "idx_agent_conversations_org" ON "agent_conversations"("organization_id");

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.agent_conversations;
CREATE POLICY tenant_isolation ON public.agent_conversations FOR ALL
    USING (app.is_system() OR "organization_id" = app.current_org_id())
    WITH CHECK (app.is_system() OR "organization_id" = app.current_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_conversations TO dental_app;
GRANT USAGE, SELECT ON SEQUENCE agent_conversations_id_seq TO dental_app;

COMMENT ON TABLE agent_conversations IS 'The AI assistant chat of one signed-in person: one row per user, replaced when they start a new chat. Written by the API only; not readable by the assistant.';
COMMENT ON COLUMN agent_conversations.organization_id IS 'Clinic the user belongs to.';
COMMENT ON COLUMN agent_conversations.user_id IS 'The person whose chat this is (unique: one conversation per user).';
COMMENT ON COLUMN agent_conversations.messages IS 'JSON array of {role: user|assistant, content} turns, oldest first, capped by the API.';
COMMENT ON COLUMN agent_conversations.created_at IS 'When the conversation started.';
COMMENT ON COLUMN agent_conversations.updated_at IS 'When the last turn was stored.';

COMMIT;

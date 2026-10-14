-- Prices and costs get a permission of their own: pricing:read.
--
-- A role may read clinical records, lab orders, consultations or stock without
-- seeing what was quoted, what the lab charged, the specialist's fee or the
-- cost price. Clinic admins grant pricing:read per role on the Roles page like
-- any other permission; nothing here is tied to a role name.
--
-- How the assistant's SQL tool enforces it inside the database:
--   * schema `agent` holds one view per table that has such a column. The view
--     returns the price column only when the transaction's permission list
--     (the setting the guarded transaction sets) holds pricing:read, else NULL.
--   * the views are owned by `dental_agent_views`, a role that cannot log in or
--     bypass RLS, so the tenant_isolation policies and the per-table permission
--     policies below still apply to every row the view reads.
--   * `dental_agent` (the role the SQL tool runs as) loses SELECT on the five
--     base tables and gains it on the views. The guarded transaction puts
--     `agent` first on the search path, so the model's plain table names
--     resolve to the views; a schema-qualified public.<table> is refused by
--     PostgreSQL ("permission denied").
--
-- Keep the table -> price columns list identical to PRICING_COLUMNS in
-- src/patient/agent/agent-access.ts, and each view's column list identical to
-- schema.prisma: agent-pricing-views.spec.ts fails when they drift.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261013200000_pricing_permission_and_agent_views/migration.sql

BEGIN;

-- 1. Existing clinics: every role that may see billing may see prices, so
--    nothing changes for anyone on the day this ships. Admins adjust from here.
INSERT INTO public.role_permissions (role_id, organization_id, permission)
SELECT role_id, organization_id, 'pricing:read'
FROM public.role_permissions
WHERE permission = 'billing:read'
ON CONFLICT DO NOTHING;

-- 2. The owner of the assistant's views.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dental_agent_views') THEN
        CREATE ROLE dental_agent_views NOLOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END $$;
GRANT dental_agent_views TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO dental_agent_views;
GRANT USAGE ON SCHEMA app TO dental_agent_views;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dental_agent_views;
GRANT SELECT ON
    public.patient_records, public.lab_orders, public.specialist_consultations,
    public.inventory_items, public.inventory_movements
TO dental_agent_views;

-- 3. The per-table permission rule the view owner must satisfy: the same keys
--    the application checks (TABLE_PERMISSIONS in agent-access.ts).
DO $$
DECLARE
    entry TEXT[];
BEGIN
    FOREACH entry SLICE 1 IN ARRAY ARRAY[
        ['patient_records',          'records:read'],
        ['lab_orders',               'lab:read'],
        ['specialist_consultations', 'specialists:read'],
        ['inventory_items',          'inventory:read'],
        ['inventory_movements',      'inventory:read']
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_views_permission ON public.%I', entry[1]);
        EXECUTE format(
            'CREATE POLICY agent_views_permission ON public.%I AS RESTRICTIVE FOR SELECT TO dental_agent_views '
            'USING (app.agent_may(%L))',
            entry[1], entry[2]);
    END LOOP;
END $$;

-- 4. The views: every column of the table, price columns gated on pricing:read.
CREATE SCHEMA IF NOT EXISTS agent;
-- The views are owned by dental_agent_views, and changing a view's owner needs
-- the new owner to hold CREATE on the schema.
GRANT CREATE, USAGE ON SCHEMA agent TO dental_agent_views;

CREATE OR REPLACE VIEW agent.patient_records AS
SELECT id, organization_id, branch_id, patient_id, appointment_id, record_type, title,
       description, tooth_number, treatment_date, created_by, invoice_id,
       CASE WHEN app.agent_has('pricing:read') THEN quoted_amount END AS quoted_amount,
       created_at, updated_at
FROM public.patient_records;

CREATE OR REPLACE VIEW agent.lab_orders AS
SELECT id, organization_id, branch_id, patient_id, lab_id, appointment_id, record_id,
       ordered_by, work_type, description, tooth_numbers, shade, status, sent_at, due_at,
       received_at, fitted_at,
       CASE WHEN app.agent_has('pricing:read') THEN cost END AS cost,
       notes, created_at, updated_at
FROM public.lab_orders;

CREATE OR REPLACE VIEW agent.specialist_consultations AS
SELECT id, organization_id, branch_id, patient_id, specialist_id, appointment_id,
       record_id, requested_by, status, consultation_date, reason, outcome,
       CASE WHEN app.agent_has('pricing:read') THEN fee END AS fee,
       notes, created_at, updated_at
FROM public.specialist_consultations;

CREATE OR REPLACE VIEW agent.inventory_items AS
SELECT id, organization_id, branch_id, name, category, description, sku, quantity,
       minimum_quantity, unit,
       CASE WHEN app.agent_has('pricing:read') THEN cost_price END AS cost_price,
       image_url, created_at, updated_at
FROM public.inventory_items;

CREATE OR REPLACE VIEW agent.inventory_movements AS
SELECT id, organization_id, item_id, movement_type, quantity,
       CASE WHEN app.agent_has('pricing:read') THEN unit_cost END AS unit_cost,
       note, performed_by, created_at
FROM public.inventory_movements;

ALTER VIEW agent.patient_records OWNER TO dental_agent_views;
ALTER VIEW agent.lab_orders OWNER TO dental_agent_views;
ALTER VIEW agent.specialist_consultations OWNER TO dental_agent_views;
ALTER VIEW agent.inventory_items OWNER TO dental_agent_views;
ALTER VIEW agent.inventory_movements OWNER TO dental_agent_views;

-- 5. The SQL tool's role reads the views, not the tables.
GRANT USAGE ON SCHEMA agent TO dental_agent;
GRANT SELECT ON
    agent.patient_records, agent.lab_orders, agent.specialist_consultations,
    agent.inventory_items, agent.inventory_movements
TO dental_agent;
REVOKE SELECT ON
    public.patient_records, public.lab_orders, public.specialist_consultations,
    public.inventory_items, public.inventory_movements
FROM dental_agent;

COMMIT;

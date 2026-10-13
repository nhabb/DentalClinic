-- Reverse of migration.sql: the assistant reads the five tables directly again
-- (price columns visible to anyone with the table permission) and pricing:read
-- disappears from every role.
BEGIN;
GRANT SELECT ON
    public.patient_records, public.lab_orders, public.specialist_consultations,
    public.inventory_items, public.inventory_movements
TO dental_agent;
DROP VIEW IF EXISTS agent.patient_records, agent.lab_orders, agent.specialist_consultations,
    agent.inventory_items, agent.inventory_movements;
DROP SCHEMA IF EXISTS agent;
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['patient_records', 'lab_orders', 'specialist_consultations',
                             'inventory_items', 'inventory_movements'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_views_permission ON public.%I', t);
    END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dental_agent_views;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM dental_agent_views;
REVOKE USAGE ON SCHEMA public, app FROM dental_agent_views;
DROP ROLE IF EXISTS dental_agent_views;
DELETE FROM public.role_permissions WHERE permission = 'pricing:read';
COMMIT;

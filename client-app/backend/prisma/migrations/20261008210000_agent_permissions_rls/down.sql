-- Reverse of migration.sql: remove the assistant's database role and policies.
BEGIN;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'appointments', 'appointment_slots', 'patient_profiles', 'patient_records',
        'patient_documents', 'users', 'treatment_invoices', 'invoice_line_items',
        'invoice_payments', 'expenses', 'expense_payments', 'inventory_items',
        'inventory_movements', 'notifications', 'roles', 'role_permissions', 'audit_logs'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS agent_permission ON public.%I', t);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS app.agent_may(TEXT);
REVOKE dental_agent FROM dental_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dental_agent;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM dental_agent;
REVOKE USAGE ON SCHEMA public, app FROM dental_agent;
DROP ROLE IF EXISTS dental_agent;

COMMIT;

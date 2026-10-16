-- The assistant reads gated tables through the views in schema `agent`, and
-- every column of the table must appear in its view (agent-pricing-views.spec).
-- Migration 20261016160000 added columns to lab_orders and
-- specialist_consultations, so their views are rebuilt here.
--
-- CREATE OR REPLACE VIEW may only append columns, never reorder them, so the
-- original list is kept as it was and the new columns follow it. That also
-- keeps the views' owner (dental_agent_views) and grants untouched.
-- No new column is a price: `cost` and `fee` remain the only gated ones.
BEGIN;

CREATE OR REPLACE VIEW agent.lab_orders AS
SELECT id, organization_id, branch_id, patient_id, lab_id, appointment_id, record_id,
       ordered_by, work_type, description, tooth_numbers, shade, status, sent_at, due_at,
       received_at, fitted_at,
       CASE WHEN app.agent_has('pricing:read') THEN cost END AS cost,
       notes, created_at, updated_at,
       material, units, tracking_ref, impression_method, try_in_at,
       remake_of_id, remake_reason
FROM public.lab_orders;

CREATE OR REPLACE VIEW agent.specialist_consultations AS
SELECT id, organization_id, branch_id, patient_id, specialist_id, appointment_id,
       record_id, requested_by, status, consultation_date, reason, outcome,
       CASE WHEN app.agent_has('pricing:read') THEN fee END AS fee,
       notes, created_at, updated_at,
       direction
FROM public.specialist_consultations;

COMMIT;

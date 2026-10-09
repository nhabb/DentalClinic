-- Describe every table and column of the clinic schema in the database itself.
--
-- The comments are the single source of truth for what the data means: they
-- show up in Supabase and psql (\d+), and the AI assistant reads them at
-- startup (src/patient/agent/schema-summary.ts) so it explains statuses and
-- columns in the app's own terms instead of guessing. Keep them in step with
-- the DTO value lists named below.
--
-- Apply with:  node scripts/apply-sql.js prisma/migrations/20261009120000_table_and_column_comments/migration.sql
-- Re-running is safe: COMMENT ON replaces the previous text.

BEGIN;

-- ── Columns every tenant table shares ────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT c.table_name FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
    LOOP
        EXECUTE format('COMMENT ON COLUMN public.%I.organization_id IS %L', t,
            'The clinic business (tenant) this row belongs to. Set by default from the request''s tenant; row-level security only shows rows of the current organization.');
    END LOOP;

    FOR t IN
        SELECT c.table_name FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'branch_id'
          AND c.table_name <> 'users'
    LOOP
        EXECUTE format('COMMENT ON COLUMN public.%I.branch_id IS %L', t,
            'The clinic location (branch) this row is tied to. Defaults to the organization''s default branch; NULL where the row is not location-bound.');
    END LOOP;

    FOR t IN
        SELECT c.table_name FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'created_at'
    LOOP
        EXECUTE format('COMMENT ON COLUMN public.%I.created_at IS %L', t, 'When the row was created.');
    END LOOP;

    FOR t IN
        SELECT c.table_name FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
    LOOP
        EXECUTE format('COMMENT ON COLUMN public.%I.updated_at IS %L', t, 'When the row was last changed.');
    END LOOP;

    FOR t IN
        SELECT c.table_name FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'id'
    LOOP
        EXECUTE format('COMMENT ON COLUMN public.%I.id IS %L', t, 'Primary key.');
    END LOOP;
END $$;

-- ── Tenancy ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE organizations IS 'One dental business (the tenant). Everything else belongs to exactly one organization. Platform admins have no organization.';
COMMENT ON COLUMN organizations.name IS 'Display name of the clinic business.';
COMMENT ON COLUMN organizations.slug IS 'URL-safe unique identifier, used as the subdomain and in the X-Organization header.';
COMMENT ON COLUMN organizations.legal_name IS 'Registered legal name, for invoices and contracts.';
COMMENT ON COLUMN organizations.email IS 'Main contact email of the business.';
COMMENT ON COLUMN organizations.phone IS 'Main contact phone of the business.';
COMMENT ON COLUMN organizations.website_url IS 'Public website, if any.';
COMMENT ON COLUMN organizations.logo_url IS 'Logo image URL shown in the app.';
COMMENT ON COLUMN organizations.description IS 'Free-text description of the business.';
COMMENT ON COLUMN organizations.timezone IS 'IANA timezone for dates and opening hours (e.g. Asia/Beirut).';
COMMENT ON COLUMN organizations.currency IS 'ISO currency code all amounts are in (e.g. USD).';
COMMENT ON COLUMN organizations.is_active IS 'false = suspended by the platform; its users cannot sign in.';
COMMENT ON COLUMN organizations.settings IS 'Free-form JSON of per-clinic settings.';

COMMENT ON TABLE branches IS 'A physical clinic location of an organization (e.g. Beirut, Tyre). Every organization has exactly one default branch.';
COMMENT ON COLUMN branches.name IS 'Location name shown to staff and patients.';
COMMENT ON COLUMN branches.code IS 'Short code unique within the organization.';
COMMENT ON COLUMN branches.address IS 'Street address.';
COMMENT ON COLUMN branches.city IS 'City.';
COMMENT ON COLUMN branches.governate IS 'Governorate / region.';
COMMENT ON COLUMN branches.phone IS 'Phone of this location.';
COMMENT ON COLUMN branches.email IS 'Email of this location.';
COMMENT ON COLUMN branches.opening_hours IS 'Opening hours as free text.';
COMMENT ON COLUMN branches.timezone IS 'Timezone override for this location, else the organization''s.';
COMMENT ON COLUMN branches.is_default IS 'true for the one branch new rows fall into when none is named.';
COMMENT ON COLUMN branches.is_active IS 'false = location closed; hidden from booking.';

COMMENT ON TABLE clinic_profile IS 'Public-facing clinic information shown on the website and patient portal. One row per organization (branch_id NULL) and optionally one per branch.';
COMMENT ON COLUMN clinic_profile.name IS 'Public clinic name.';
COMMENT ON COLUMN clinic_profile.phone IS 'Public phone.';
COMMENT ON COLUMN clinic_profile.email IS 'Public email.';
COMMENT ON COLUMN clinic_profile.address IS 'Public address.';
COMMENT ON COLUMN clinic_profile.website_url IS 'Public website.';
COMMENT ON COLUMN clinic_profile.logo_url IS 'Logo shown on the public pages.';
COMMENT ON COLUMN clinic_profile.description IS 'About-the-clinic text.';
COMMENT ON COLUMN clinic_profile.opening_hours IS 'Opening hours as free text.';

-- ── People ───────────────────────────────────────────────────────────────────
COMMENT ON TABLE users IS 'Every account: staff (admin, doctor, secretary, custom roles), patients (role = patient, one row per patient, with a patient_profiles row for clinical details) and platform admins (role = superadmin, organization_id NULL).';
COMMENT ON COLUMN users.branch_id IS 'Home branch of a staff member; NULL for patients and platform admins.';
COMMENT ON COLUMN users.restrict_to_branch IS 'true = this staff member only sees and acts on their home branch.';
COMMENT ON COLUMN users.email IS 'Login email; unique. May be NULL for patients created at the desk without an email.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash of the password. Never exposed.';
COMMENT ON COLUMN users.first_name IS 'Given name.';
COMMENT ON COLUMN users.last_name IS 'Family name.';
COMMENT ON COLUMN users.phone IS 'Contact phone.';
COMMENT ON COLUMN users.date_of_birth IS 'Date of birth.';
COMMENT ON COLUMN users.gender IS 'male | female | other.';
COMMENT ON COLUMN users.address IS 'Home address.';
COMMENT ON COLUMN users.role IS 'Role key: admin (every permission), doctor, secretary, a clinic-defined custom key, patient (no staff permissions) or superadmin (platform). Staff permissions come from roles / role_permissions for this key.';
COMMENT ON COLUMN users.is_active IS 'false = deactivated; the account cannot sign in or use existing tokens.';
COMMENT ON COLUMN users.avatar_url IS 'Profile picture URL.';
COMMENT ON COLUMN users.must_set_password IS 'true until the person has set a password through the setup link.';
COMMENT ON COLUMN users.password_setup_token_hash IS 'Hash of the one-time password-setup link token. Never exposed.';
COMMENT ON COLUMN users.password_setup_expires_at IS 'When the password-setup link stops working.';
COMMENT ON COLUMN users.password_setup_sent_at IS 'When the password-setup link was last emailed.';

COMMENT ON TABLE patient_profiles IS 'Clinical and personal details of a patient, one row per patient user (users.role = patient). Appointments, records, documents, invoices and lab work reference this id, not users.id.';
COMMENT ON COLUMN patient_profiles.user_id IS 'The patient''s account in users (name, email, phone, birth date live there).';
COMMENT ON COLUMN patient_profiles.emergency_contact_name IS 'Who to call in an emergency.';
COMMENT ON COLUMN patient_profiles.emergency_contact_phone IS 'Their phone number.';
COMMENT ON COLUMN patient_profiles.blood_type IS 'Blood group (A+, O-, ...).';
COMMENT ON COLUMN patient_profiles.allergies IS 'Known allergies, free text.';
COMMENT ON COLUMN patient_profiles.medical_notes IS 'General medical history and warnings, free text.';
COMMENT ON COLUMN patient_profiles.city IS 'City of residence.';
COMMENT ON COLUMN patient_profiles.governate IS 'Governorate / region of residence.';
COMMENT ON COLUMN patient_profiles.current_medications IS 'Medicines the patient currently takes, free text.';
COMMENT ON COLUMN patient_profiles.insurance_provider IS 'Insurance company, if any.';
COMMENT ON COLUMN patient_profiles.insurance_policy IS 'Insurance policy number.';
COMMENT ON COLUMN patient_profiles.profile_complete IS 'true once the patient filled in the required profile fields.';
COMMENT ON COLUMN patient_profiles.photo_url IS 'Patient photo URL.';

COMMENT ON TABLE roles IS 'The roles a clinic can give its staff. Each organization has the built-in admin, doctor, secretary and patient roles plus any custom ones. users.role holds the key.';
COMMENT ON COLUMN roles.key IS 'Stable identifier stored in users.role (admin, doctor, secretary, patient or a custom key). Unique per organization.';
COMMENT ON COLUMN roles.name IS 'Display name.';
COMMENT ON COLUMN roles.description IS 'What the role is for.';
COMMENT ON COLUMN roles.is_system IS 'true for the built-in roles, which cannot be deleted. admin always has every permission; patient has none.';

COMMENT ON TABLE role_permissions IS 'Which permissions a role holds: one row per (role, permission key such as billing:read). The permission catalog is defined in code (src/shared/authorization/permissions.ts).';
COMMENT ON COLUMN role_permissions.role_id IS 'The role.';
COMMENT ON COLUMN role_permissions.permission IS 'Permission key in the form area:action (appointments:read, billing:write, roles:manage, ...).';

-- ── Scheduling ───────────────────────────────────────────────────────────────
COMMENT ON TABLE appointment_slots IS 'Bookable time slots a doctor offers at a branch. A patient books a slot, which creates an appointment and marks the slot booked.';
COMMENT ON COLUMN appointment_slots.doctor_id IS 'The doctor (users.id) available in this slot.';
COMMENT ON COLUMN appointment_slots.slot_date IS 'Calendar date of the slot.';
COMMENT ON COLUMN appointment_slots.start_time IS 'Start time of day.';
COMMENT ON COLUMN appointment_slots.end_time IS 'End time of day.';
COMMENT ON COLUMN appointment_slots.is_booked IS 'true once an appointment occupies the slot; freed again if that appointment is cancelled.';

COMMENT ON TABLE appointments IS 'A patient''s visit with a doctor. Flow: scheduled -> confirmed -> completed; cancelled and no_show are terminal. "Scheduled" is an appointment status only, never a treatment status.';
COMMENT ON COLUMN appointments.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN appointments.doctor_id IS 'The treating doctor (users.id).';
COMMENT ON COLUMN appointments.slot_id IS 'The appointment_slots row this visit occupies, if booked through a slot.';
COMMENT ON COLUMN appointments.appointment_date IS 'Calendar date of the visit.';
COMMENT ON COLUMN appointments.start_time IS 'Start time of day.';
COMMENT ON COLUMN appointments.end_time IS 'End time of day.';
COMMENT ON COLUMN appointments.status IS 'scheduled (booked) | confirmed | completed | cancelled | no_show (patient did not come).';
COMMENT ON COLUMN appointments.reason IS 'Why the patient is coming, as given at booking.';
COMMENT ON COLUMN appointments.notes IS 'Staff notes about the visit.';
COMMENT ON COLUMN appointments.created_by IS 'Who booked it (users.id); NULL when the patient booked online.';

-- ── Clinical ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE patient_records IS 'Clinical history of a patient: dental work per tooth, plans, diagnoses, notes, prescriptions. Work on the chart has three statuses, given by record_type: treatment = completed, treatment_plan = planned (not done yet, whatever its date), missing_tooth = tooth absent. There is no "scheduled" work status.';
COMMENT ON COLUMN patient_records.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN patient_records.appointment_id IS 'The visit during which this was recorded, if any. Planned work has an appointment only when this is set; its date alone means nothing.';
COMMENT ON COLUMN patient_records.record_type IS 'general_note | diagnosis | treatment (completed work) | treatment_plan (planned work) | missing_tooth | prescription | xray | lab_result | other. The dental chart shows treatment_plan as "planned", missing_tooth as "missing", everything else as completed.';
COMMENT ON COLUMN patient_records.title IS 'Short title; for chart work, the procedure name (Filling, Root Canal, Crown, ...).';
COMMENT ON COLUMN patient_records.description IS 'Details of the record.';
COMMENT ON COLUMN patient_records.tooth_number IS 'FDI tooth number (11-48 permanent, 51-85 primary) when the record is about one tooth.';
COMMENT ON COLUMN patient_records.treatment_date IS 'Date of the work for completed records; for planned work, the date entered when it was planned (not an appointment).';
COMMENT ON COLUMN patient_records.created_by IS 'The staff member who wrote the record (users.id).';
COMMENT ON COLUMN patient_records.invoice_id IS 'The treatment invoice that billed this work, once billed. NULL = not yet billed. Prevents billing the same work twice.';
COMMENT ON COLUMN patient_records.quoted_amount IS 'Price agreed when the work was planned; used as the line amount when it is completed and billed. Not a payment.';

COMMENT ON TABLE patient_documents IS 'Files uploaded for a patient: x-rays, scans, reports, prescriptions. Stored in object storage; this row holds the metadata.';
COMMENT ON COLUMN patient_documents.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN patient_documents.record_id IS 'The clinical record this file belongs to, if attached to one.';
COMMENT ON COLUMN patient_documents.file_name IS 'Original file name.';
COMMENT ON COLUMN patient_documents.file_path IS 'Path in object storage.';
COMMENT ON COLUMN patient_documents.document_type IS 'xray | scan | report | prescription | other.';
COMMENT ON COLUMN patient_documents.uploaded_by IS 'Who uploaded it (users.id).';
COMMENT ON COLUMN patient_documents.uploaded_at IS 'When it was uploaded.';

COMMENT ON TABLE specialists IS 'Outside doctors (not clinic staff) the clinic asks for help on certain cases.';
COMMENT ON COLUMN specialists.name IS 'Full name.';
COMMENT ON COLUMN specialists.specialty IS 'Field (orthodontics, oral surgery, ...).';
COMMENT ON COLUMN specialists.phone IS 'Contact phone.';
COMMENT ON COLUMN specialists.email IS 'Contact email.';
COMMENT ON COLUMN specialists.clinic_name IS 'Where the specialist practises.';
COMMENT ON COLUMN specialists.notes IS 'Free notes.';
COMMENT ON COLUMN specialists.is_active IS 'false = no longer used; hidden from new consultations.';

COMMENT ON TABLE specialist_consultations IS 'A case on which an outside specialist was asked to help, for one patient. Flow: requested -> scheduled -> completed; cancelled is terminal.';
COMMENT ON COLUMN specialist_consultations.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN specialist_consultations.specialist_id IS 'The outside specialist.';
COMMENT ON COLUMN specialist_consultations.appointment_id IS 'The clinic visit this relates to, if any.';
COMMENT ON COLUMN specialist_consultations.record_id IS 'The clinical record (case) this relates to, if any.';
COMMENT ON COLUMN specialist_consultations.requested_by IS 'The staff member who asked for the consultation (users.id).';
COMMENT ON COLUMN specialist_consultations.status IS 'requested | scheduled | completed | cancelled.';
COMMENT ON COLUMN specialist_consultations.consultation_date IS 'When the specialist sees or saw the patient.';
COMMENT ON COLUMN specialist_consultations.reason IS 'Why the specialist was asked.';
COMMENT ON COLUMN specialist_consultations.outcome IS 'What the specialist concluded or did.';
COMMENT ON COLUMN specialist_consultations.fee IS 'The specialist''s fee, for reporting. Not a patient payment; the patient is billed through invoices as usual.';
COMMENT ON COLUMN specialist_consultations.notes IS 'Free notes.';

COMMENT ON TABLE dental_labs IS 'Dental laboratories the clinic sends work to (crowns, dentures, aligners, ...).';
COMMENT ON COLUMN dental_labs.name IS 'Lab name.';
COMMENT ON COLUMN dental_labs.phone IS 'Contact phone.';
COMMENT ON COLUMN dental_labs.email IS 'Contact email.';
COMMENT ON COLUMN dental_labs.address IS 'Address.';
COMMENT ON COLUMN dental_labs.notes IS 'Free notes.';
COMMENT ON COLUMN dental_labs.is_active IS 'false = no longer used; hidden from new orders.';

COMMENT ON TABLE lab_orders IS 'Work sent to a dental lab for one patient''s case. Flow: ordered -> sent -> received -> fitted; cancelled is terminal.';
COMMENT ON COLUMN lab_orders.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN lab_orders.lab_id IS 'The dental lab doing the work.';
COMMENT ON COLUMN lab_orders.appointment_id IS 'The visit this relates to, if any.';
COMMENT ON COLUMN lab_orders.record_id IS 'The clinical record (case) this relates to, if any.';
COMMENT ON COLUMN lab_orders.ordered_by IS 'The staff member who placed the order (users.id).';
COMMENT ON COLUMN lab_orders.work_type IS 'crown | bridge | denture | implant | aligner | retainer | veneer | other.';
COMMENT ON COLUMN lab_orders.description IS 'What exactly was ordered.';
COMMENT ON COLUMN lab_orders.tooth_numbers IS 'FDI tooth numbers the work is for, comma-separated.';
COMMENT ON COLUMN lab_orders.shade IS 'Tooth shade requested (e.g. A2).';
COMMENT ON COLUMN lab_orders.status IS 'ordered | sent (to the lab) | received (back from the lab) | fitted (placed in the patient''s mouth) | cancelled.';
COMMENT ON COLUMN lab_orders.sent_at IS 'When it was sent to the lab.';
COMMENT ON COLUMN lab_orders.due_at IS 'When the lab promised it back.';
COMMENT ON COLUMN lab_orders.received_at IS 'When it came back from the lab.';
COMMENT ON COLUMN lab_orders.fitted_at IS 'When it was fitted on the patient.';
COMMENT ON COLUMN lab_orders.cost IS 'What the lab charges the clinic. Not a patient payment.';
COMMENT ON COLUMN lab_orders.notes IS 'Free notes.';

-- ── Money ────────────────────────────────────────────────────────────────────
COMMENT ON TABLE treatment_invoices IS 'What a patient is charged for dental work. Money received is recorded only in invoice_payments; totals and status here are recomputed from those payments by database triggers. Status: open (nothing paid) | partial | paid.';
COMMENT ON COLUMN treatment_invoices.patient_id IS 'The patient (patient_profiles.id).';
COMMENT ON COLUMN treatment_invoices.procedure_date IS 'Date of the work being billed.';
COMMENT ON COLUMN treatment_invoices.notes IS 'Free notes.';
COMMENT ON COLUMN treatment_invoices.total_amount IS 'Sum of the line items.';
COMMENT ON COLUMN treatment_invoices.amount_paid IS 'Sum of invoice_payments for this invoice (maintained by trigger).';
COMMENT ON COLUMN treatment_invoices.remaining_amount IS 'total_amount - amount_paid (maintained by trigger).';
COMMENT ON COLUMN treatment_invoices.status IS 'open (nothing paid yet) | partial (some paid) | paid (fully settled). Maintained by trigger.';
COMMENT ON COLUMN treatment_invoices.created_by IS 'The staff member who issued it (users.id).';

COMMENT ON TABLE invoice_line_items IS 'The procedures on an invoice, one row each.';
COMMENT ON COLUMN invoice_line_items.invoice_id IS 'The invoice.';
COMMENT ON COLUMN invoice_line_items.procedure_name IS 'Procedure from the clinic''s price list (Checkup, Filling, Root Canal, Crown, ...).';
COMMENT ON COLUMN invoice_line_items.amount IS 'Price charged for this line.';
COMMENT ON COLUMN invoice_line_items.tooth_number IS 'FDI tooth number the procedure was on, if one tooth.';

COMMENT ON TABLE invoice_payments IS 'Money received from patients. Every payment belongs to one invoice; this is the only place patient payments are stored.';
COMMENT ON COLUMN invoice_payments.invoice_id IS 'The invoice being paid.';
COMMENT ON COLUMN invoice_payments.amount IS 'Amount received (positive).';
COMMENT ON COLUMN invoice_payments.payment_method IS 'cash | card | insurance | bank_transfer.';
COMMENT ON COLUMN invoice_payments.notes IS 'Free notes (receipt number, insurer reference, ...).';
COMMENT ON COLUMN invoice_payments.created_by IS 'Who recorded the payment (users.id).';

COMMENT ON TABLE expenses IS 'Money the clinic spends (rent, supplies, equipment, ...). Money paid out is recorded only in expense_payments; amount_paid and status are recomputed from those by trigger.';
COMMENT ON COLUMN expenses.title IS 'What the expense is.';
COMMENT ON COLUMN expenses.category IS 'utilities | rent | equipment | supplies | maintenance | other.';
COMMENT ON COLUMN expenses.status IS 'pending (not fully paid) | paid (fully paid). Maintained by trigger.';
COMMENT ON COLUMN expenses.amount IS 'Total owed for this expense.';
COMMENT ON COLUMN expenses.amount_paid IS 'Sum of expense_payments (maintained by trigger).';
COMMENT ON COLUMN expenses.description IS 'Details.';
COMMENT ON COLUMN expenses.expense_date IS 'Date the expense was incurred.';
COMMENT ON COLUMN expenses.created_by IS 'Who recorded it (users.id).';

COMMENT ON TABLE expense_payments IS 'Money paid out against an expense; one row per payment.';
COMMENT ON COLUMN expense_payments.expense_id IS 'The expense being paid.';
COMMENT ON COLUMN expense_payments.amount IS 'Amount paid (positive).';
COMMENT ON COLUMN expense_payments.payment_method IS 'cash | card | bank_transfer | other.';
COMMENT ON COLUMN expense_payments.notes IS 'Free notes.';
COMMENT ON COLUMN expense_payments.payment_date IS 'Date the payment was made.';
COMMENT ON COLUMN expense_payments.created_by IS 'Who recorded it (users.id).';

-- ── Stock ────────────────────────────────────────────────────────────────────
COMMENT ON TABLE inventory_items IS 'Supplies and materials kept at a branch, with current stock level. Stock changes are recorded in inventory_movements.';
COMMENT ON COLUMN inventory_items.name IS 'Item name.';
COMMENT ON COLUMN inventory_items.category IS 'Free-text category (consumables, instruments, ...).';
COMMENT ON COLUMN inventory_items.description IS 'Details.';
COMMENT ON COLUMN inventory_items.sku IS 'Stock-keeping code, unique per organization.';
COMMENT ON COLUMN inventory_items.quantity IS 'Units currently in stock.';
COMMENT ON COLUMN inventory_items.minimum_quantity IS 'Reorder threshold: the item is "low stock" when quantity <= minimum_quantity.';
COMMENT ON COLUMN inventory_items.unit IS 'Unit of measure (box, piece, ml, ...).';
COMMENT ON COLUMN inventory_items.cost_price IS 'Purchase price per unit.';
COMMENT ON COLUMN inventory_items.image_url IS 'Picture of the item.';

COMMENT ON TABLE inventory_movements IS 'Every change to an item''s stock: deliveries in, usage out, and manual corrections.';
COMMENT ON COLUMN inventory_movements.item_id IS 'The inventory item.';
COMMENT ON COLUMN inventory_movements.movement_type IS 'in (stock added) | out (stock used or removed) | adjustment (count corrected).';
COMMENT ON COLUMN inventory_movements.quantity IS 'Units moved.';
COMMENT ON COLUMN inventory_movements.unit_cost IS 'Cost per unit for this movement, when known.';
COMMENT ON COLUMN inventory_movements.note IS 'Reason or reference.';
COMMENT ON COLUMN inventory_movements.performed_by IS 'Who recorded it (users.id).';

-- ── System ───────────────────────────────────────────────────────────────────
COMMENT ON TABLE notifications IS 'In-app messages to a user, mostly about their appointments.';
COMMENT ON COLUMN notifications.user_id IS 'The recipient (users.id).';
COMMENT ON COLUMN notifications.title IS 'Short headline.';
COMMENT ON COLUMN notifications.message IS 'Body text.';
COMMENT ON COLUMN notifications.type IS 'appointment_booked | appointment_confirmed | appointment_completed | appointment_cancelled | appointment_no_show | other kinds added over time.';
COMMENT ON COLUMN notifications.is_read IS 'true once the user opened it.';

COMMENT ON TABLE audit_logs IS 'Who changed what: one row per audited change, with the row before and after. Written by the app and by the platform console (actions prefixed platform.).';
COMMENT ON COLUMN audit_logs.user_id IS 'Who made the change (users.id); NULL for system actions.';
COMMENT ON COLUMN audit_logs.action IS 'What happened, e.g. create, update, delete or platform.role_updated.';
COMMENT ON COLUMN audit_logs.table_name IS 'The table that was changed.';
COMMENT ON COLUMN audit_logs.record_id IS 'The id of the changed row.';
COMMENT ON COLUMN audit_logs.old_data IS 'The row before the change (JSON).';
COMMENT ON COLUMN audit_logs.new_data IS 'The row after the change (JSON).';

COMMIT;

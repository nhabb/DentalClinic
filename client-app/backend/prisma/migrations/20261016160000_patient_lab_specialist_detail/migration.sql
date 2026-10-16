-- Richer records: a patient file that reads like a real document, lab cases
-- with the detail a technician needs, and outside doctors with the direction
-- of the referral. Additive only: every column is nullable, so existing rows
-- stay valid and RLS (table-level) already covers them.
BEGIN;

-- ── The patient file ────────────────────────────────────────────────────────
-- Work: who the patient is outside the chair, and a daytime number.
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS occupation   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS employer     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS work_phone   VARCHAR(30);

-- Emergency contacts: who the existing name/phone actually is, plus a second.
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship   VARCHAR(60),
  ADD COLUMN IF NOT EXISTS emergency_contact_2_name         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emergency_contact_2_phone        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS emergency_contact_2_relationship VARCHAR(60);

-- Identity: the administrative half of a real file.
ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS national_id        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS marital_status     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS nationality        VARCHAR(60),
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5);

ALTER TABLE patient_profiles
  DROP CONSTRAINT IF EXISTS patient_profiles_marital_status_check;
ALTER TABLE patient_profiles
  ADD CONSTRAINT patient_profiles_marital_status_check
  CHECK (marital_status IS NULL OR marital_status IN
    ('single', 'married', 'divorced', 'widowed', 'other'));

ALTER TABLE patient_profiles
  DROP CONSTRAINT IF EXISTS patient_profiles_preferred_language_check;
ALTER TABLE patient_profiles
  ADD CONSTRAINT patient_profiles_preferred_language_check
  CHECK (preferred_language IS NULL OR preferred_language IN ('en', 'ar', 'fr'));

COMMENT ON COLUMN patient_profiles.occupation IS 'What the patient does for a living.';
COMMENT ON COLUMN patient_profiles.employer IS 'Where they work.';
COMMENT ON COLUMN patient_profiles.work_phone IS 'Daytime number at work.';
COMMENT ON COLUMN patient_profiles.emergency_contact_relationship IS 'How the emergency contact is related to the patient (spouse, son, neighbour, ...).';
COMMENT ON COLUMN patient_profiles.emergency_contact_2_name IS 'A second person to call in an emergency.';
COMMENT ON COLUMN patient_profiles.emergency_contact_2_phone IS 'Their phone number.';
COMMENT ON COLUMN patient_profiles.emergency_contact_2_relationship IS 'How the second emergency contact is related to the patient.';
COMMENT ON COLUMN patient_profiles.national_id IS 'National ID or civil record number, as written on the document.';
COMMENT ON COLUMN patient_profiles.marital_status IS 'single, married, divorced, widowed or other.';
COMMENT ON COLUMN patient_profiles.nationality IS 'Nationality as the patient states it.';
COMMENT ON COLUMN patient_profiles.preferred_language IS 'Language to speak and write to this patient in: en, ar or fr.';

-- ── Lab cases ───────────────────────────────────────────────────────────────
-- What the technician needs to make the piece, and how the case travelled.
ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS material          VARCHAR(80),
  ADD COLUMN IF NOT EXISTS units             INTEGER,
  ADD COLUMN IF NOT EXISTS tracking_ref      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS impression_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS try_in_at         DATE,
  -- A remake points at the order it replaces, so a lab's remake rate is countable.
  ADD COLUMN IF NOT EXISTS remake_of_id      BIGINT,
  ADD COLUMN IF NOT EXISTS remake_reason     TEXT;

ALTER TABLE lab_orders
  DROP CONSTRAINT IF EXISTS lab_orders_units_check;
ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_units_check
  CHECK (units IS NULL OR (units > 0 AND units <= 32));

ALTER TABLE lab_orders
  DROP CONSTRAINT IF EXISTS lab_orders_impression_method_check;
ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_impression_method_check
  CHECK (impression_method IS NULL OR impression_method IN ('digital', 'physical'));

-- A remake must point at a real order, and never at itself.
ALTER TABLE lab_orders
  DROP CONSTRAINT IF EXISTS lab_orders_remake_of_fkey;
ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_remake_of_fkey
  FOREIGN KEY (remake_of_id) REFERENCES lab_orders (id) ON DELETE SET NULL;

ALTER TABLE lab_orders
  DROP CONSTRAINT IF EXISTS lab_orders_remake_not_self_check;
ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_remake_not_self_check
  CHECK (remake_of_id IS NULL OR remake_of_id <> id);

CREATE INDEX IF NOT EXISTS idx_lab_orders_remake_of ON lab_orders (remake_of_id);

COMMENT ON COLUMN lab_orders.material IS 'What the piece is made of (zirconia, e.max, PFM, acrylic, ...).';
COMMENT ON COLUMN lab_orders.units IS 'How many pieces or units this case covers (1-32).';
COMMENT ON COLUMN lab_orders.tracking_ref IS 'Courier or lab reference for the case in transit.';
COMMENT ON COLUMN lab_orders.impression_method IS 'How the impression was taken: digital (intraoral scan) or physical.';
COMMENT ON COLUMN lab_orders.try_in_at IS 'Day of the try-in or bisque fitting, between sending and fitting.';
COMMENT ON COLUMN lab_orders.remake_of_id IS 'The earlier lab order this one remakes; NULL for a first attempt.';
COMMENT ON COLUMN lab_orders.remake_reason IS 'Why the earlier piece had to be remade (shade, fit, breakage, ...).';

-- The lab itself: who to call, how long they take, how they are paid.
ALTER TABLE dental_labs
  ADD COLUMN IF NOT EXISTS contact_person  VARCHAR(120),
  ADD COLUMN IF NOT EXISTS turnaround_days INTEGER,
  ADD COLUMN IF NOT EXISTS payment_terms   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS tax_number      VARCHAR(60);

ALTER TABLE dental_labs
  DROP CONSTRAINT IF EXISTS dental_labs_turnaround_days_check;
ALTER TABLE dental_labs
  ADD CONSTRAINT dental_labs_turnaround_days_check
  CHECK (turnaround_days IS NULL OR (turnaround_days > 0 AND turnaround_days <= 365));

COMMENT ON COLUMN dental_labs.contact_person IS 'Named person to deal with at the lab.';
COMMENT ON COLUMN dental_labs.turnaround_days IS 'Working days the lab usually takes; a new order due date defaults from this.';
COMMENT ON COLUMN dental_labs.payment_terms IS 'How this lab is paid (30 days, on delivery, ...).';
COMMENT ON COLUMN dental_labs.tax_number IS 'Tax or VAT registration number, for the lab''s invoices.';

-- ── Outside doctors ─────────────────────────────────────────────────────────
-- Which way the patient moved: we sent them out, the outside doctor sent them
-- to us, or the outside doctor treated the patient here in our clinic.
ALTER TABLE specialist_consultations
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'referred_out';

ALTER TABLE specialist_consultations
  DROP CONSTRAINT IF EXISTS specialist_consultations_direction_check;
ALTER TABLE specialist_consultations
  ADD CONSTRAINT specialist_consultations_direction_check
  CHECK (direction IN ('referred_out', 'referred_in', 'visiting'));

CREATE INDEX IF NOT EXISTS idx_specialist_consultations_direction
  ON specialist_consultations (organization_id, direction);

COMMENT ON COLUMN specialist_consultations.direction IS 'Which way the patient moved: referred_out (we sent the patient to the outside doctor), referred_in (the outside doctor sent the patient to us) or visiting (the outside doctor treated the patient at our clinic).';

COMMIT;

-- Dental chart work: link treatment records to the invoice they were billed on,
-- and keep the tooth number on invoice line items.

ALTER TABLE "invoice_line_items" ADD COLUMN "tooth_number" VARCHAR;

ALTER TABLE "patient_records" ADD COLUMN "invoice_id" BIGINT;
ALTER TABLE "patient_records" ADD CONSTRAINT "patient_records_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "treatment_invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_patient_records_invoice_id" ON "patient_records"("invoice_id");

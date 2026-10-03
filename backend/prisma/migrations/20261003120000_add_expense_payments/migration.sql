-- Expenses: track partial payments.
-- amount_paid is the running total of recorded payments; remaining = amount - amount_paid.
-- status is derived: pending (nothing paid) | partial | paid.

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill: expenses already marked paid are considered fully paid.
UPDATE "expenses" SET "amount_paid" = "amount" WHERE "status" = 'paid';

-- CreateTable
CREATE TABLE "expense_payments" (
    "id" BIGSERIAL NOT NULL,
    "expense_id" BIGINT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" VARCHAR NOT NULL DEFAULT 'cash',
    "notes" TEXT,
    "payment_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "created_by" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_expense_payments_expense_id" ON "expense_payments"("expense_id");

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_fkey"
    FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Backfill a payment row for expenses that were already fully paid, so history is consistent.
INSERT INTO "expense_payments" ("expense_id", "amount", "payment_method", "notes", "payment_date", "created_by", "created_at")
SELECT "id", "amount", 'cash', 'Marked as paid before payment tracking was added', "expense_date", "created_by", "updated_at"
FROM "expenses"
WHERE "status" = 'paid' AND "amount" > 0;

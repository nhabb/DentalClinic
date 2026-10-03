-- Patients created by the clinic may have no email address.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Password setup (invite) flow for clinic-created accounts.
-- must_set_password: account was created by staff and the owner has not chosen a password yet.
-- password_setup_token_hash / expires_at: sha256 of the one-time link token and its expiry.
ALTER TABLE "users" ADD COLUMN "must_set_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "password_setup_token_hash" VARCHAR;
ALTER TABLE "users" ADD COLUMN "password_setup_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN "password_setup_sent_at" TIMESTAMPTZ(6);

CREATE INDEX "idx_users_password_setup_token_hash" ON "users"("password_setup_token_hash");

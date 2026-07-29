-- Phase A1a — enrollment payment contract + PaymentEvent audit trail

CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE "PricingTier" AS ENUM ('REGULAR', 'STUDENT', 'COUPLE', 'UNLIMITED_PASS');
CREATE TYPE "PaymentProvider" AS ENUM ('PAYPAL', 'STRIPE');

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "pricing_tier" "PricingTier" NOT NULL DEFAULT 'REGULAR',
  ADD COLUMN IF NOT EXISTS "amount_cad" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "waitlisted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "promoted_at" TIMESTAMP(3);

-- Existing paid pilot/seed rows stay green in analytics.
UPDATE "enrollments"
SET
  "payment_status" = 'PAID',
  "paid_at" = COALESCE("paid_at", "created_at")
WHERE "paid" = true
  AND "payment_status" = 'NONE';

-- Waitlist queue ordering for A3.
UPDATE "enrollments"
SET "waitlisted_at" = COALESCE("waitlisted_at", "created_at")
WHERE "waitlisted" = true
  AND "waitlisted_at" IS NULL;

-- Backfill amount from the session regular price when missing.
UPDATE "enrollments" AS e
SET "amount_cad" = cs."price_regular"
FROM "class_sessions" AS cs
WHERE e."session_id" = cs."id"
  AND e."amount_cad" IS NULL;

CREATE TABLE IF NOT EXISTS "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "external_transaction_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_events_provider_external_transaction_id_event_type_key"
  ON "payment_events"("provider", "external_transaction_id", "event_type");

CREATE INDEX IF NOT EXISTS "payment_events_enrollment_id_created_at_idx"
  ON "payment_events"("enrollment_id", "created_at");

ALTER TABLE "payment_events"
  DROP CONSTRAINT IF EXISTS "payment_events_enrollment_id_fkey";
ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "enrollments_session_id_payment_status_paid_idx"
  ON "enrollments"("session_id", "payment_status", "paid");

CREATE INDEX IF NOT EXISTS "enrollments_session_id_waitlisted_waitlisted_at_idx"
  ON "enrollments"("session_id", "waitlisted", "waitlisted_at");

-- Unpaid online rental holds release their slot after `expires_at`.
-- Idempotent so the runtime bootstrap (`ensureStudioOsSchema`) and
-- `prisma migrate deploy` can both apply it.

ALTER TYPE "RentalBookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "rental_bookings" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "rental_bookings_status_expires_at_idx"
  ON "rental_bookings"("status", "expires_at");

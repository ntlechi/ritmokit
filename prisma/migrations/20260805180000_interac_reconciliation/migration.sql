-- AlterEnum PaymentStatus
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_INTERAC';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED_INTERAC';

-- AlterEnum PaymentProvider
ALTER TYPE "PaymentProvider" ADD VALUE 'INTERAC';
ALTER TYPE "PaymentProvider" ADD VALUE 'CASH';

-- CreateTable
CREATE TABLE "location_interac_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "deposit_email" TEXT,
    "security_question" TEXT,
    "password_hint" TEXT,
    "inbox_url" TEXT,
    "notify_staff_email" TEXT,
    "alert_on_pending" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_interac_settings_pkey" PRIMARY KEY ("id")
);

-- AlterTable enrollments
ALTER TABLE "enrollments" ADD COLUMN "payment_provider" "PaymentProvider",
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CAD',
ADD COLUMN "payment_pending_at" TIMESTAMP(3),
ADD COLUMN "payment_confirmed_by_id" UUID,
ADD COLUMN "payment_cancelled_at" TIMESTAMP(3),
ADD COLUMN "payment_cancelled_by_id" UUID,
ADD COLUMN "cancellation_reason" TEXT,
ADD COLUMN "interac_reference_hint" TEXT,
ADD COLUMN "ticket_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "location_interac_settings_location_id_key" ON "location_interac_settings"("location_id");

CREATE UNIQUE INDEX "enrollments_ticket_code_key" ON "enrollments"("ticket_code");

CREATE INDEX "enrollments_payment_status_payment_pending_at_idx" ON "enrollments"("payment_status", "payment_pending_at");

-- AddForeignKey
ALTER TABLE "location_interac_settings" ADD CONSTRAINT "location_interac_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_payment_confirmed_by_id_fkey" FOREIGN KEY ("payment_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_payment_cancelled_by_id_fkey" FOREIGN KEY ("payment_cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

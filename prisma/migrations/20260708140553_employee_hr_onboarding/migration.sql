-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "employee_hr_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "sin_last_four" TEXT,
    "bank_institution_number" TEXT,
    "bank_transit_number" TEXT,
    "bank_account_number" TEXT,
    "has_signed_handbook" BOOLEAN NOT NULL DEFAULT false,
    "handbook_signature_name" TEXT,
    "handbook_signed_at" TIMESTAMP(3),
    "handbook_ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_hr_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_hr_profiles_user_id_key" ON "employee_hr_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "employee_hr_profiles" ADD CONSTRAINT "employee_hr_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

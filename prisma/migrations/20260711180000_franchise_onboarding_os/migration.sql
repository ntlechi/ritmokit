-- Franchise Onboarding OS: org brand kit, module unlock days, punch PIN hash
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "primary_color" TEXT NOT NULL DEFAULT '#4f46e5';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "welcome_copy" TEXT;

ALTER TABLE "formation_modules" ADD COLUMN IF NOT EXISTS "unlock_day" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "employee_hr_profiles" ADD COLUMN IF NOT EXISTS "punch_pin_hash" TEXT;

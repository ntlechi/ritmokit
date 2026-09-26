-- Nouveaux élèves inbox: one intake row per student per location.
-- Idempotent so the runtime bootstrap (`ensureStudioOsSchema`) and
-- `prisma migrate deploy` can both apply it.

DO $$ BEGIN
  CREATE TYPE "IntakeStatus" AS ENUM ('NEW', 'CONTACTED', 'ATTENDED', 'ACTIVE', 'LOST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IntakeSource" AS ENUM ('WEBSITE', 'DOOR', 'STAFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "student_intakes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
  "source" "IntakeSource" NOT NULL,
  "first_session_id" UUID,
  "assigned_to_id" UUID,
  "contacted_at" TIMESTAMP(3),
  "first_attended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_intakes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_intakes_student_id_location_id_key"
  ON "student_intakes"("student_id", "location_id");
CREATE INDEX IF NOT EXISTS "student_intakes_location_id_status_created_at_idx"
  ON "student_intakes"("location_id", "status", "created_at");

DO $$ BEGIN
  ALTER TABLE "student_intakes" ADD CONSTRAINT "student_intakes_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "student_intakes" ADD CONSTRAINT "student_intakes_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "student_intakes" ADD CONSTRAINT "student_intakes_first_session_id_fkey"
    FOREIGN KEY ("first_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "student_intakes" ADD CONSTRAINT "student_intakes_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

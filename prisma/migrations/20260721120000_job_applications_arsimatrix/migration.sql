-- Job applications → Arsimatrix bati-recruit connector

CREATE TYPE "JobApplicationStatus" AS ENUM (
  'PENDING',
  'TRIAGING',
  'SHORTLISTED',
  'REJECTED',
  'INTERVIEW',
  'HIRED',
  'WITHDRAWN'
);

CREATE TYPE "JobShiftWindow" AS ENUM (
  'MIDI',
  'SOIR',
  'FERMETURE',
  'WEEKEND'
);

CREATE TABLE "job_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "location_id" UUID NOT NULL,
  "full_name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "neighborhood" TEXT NOT NULL,
  "available_shifts" "JobShiftWindow"[],
  "commute_minutes" INTEGER NOT NULL,
  "years_experience" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "has_food_permit" BOOLEAN NOT NULL DEFAULT false,
  "speaks_french" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "status" "JobApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "triage_score" INTEGER,
  "triage_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "triage_summary" TEXT,
  "triaged_at" TIMESTAMP(3),
  "arsimatrix_trace_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "job_applications_location_id_status_created_at_idx"
  ON "job_applications"("location_id", "status", "created_at");

CREATE INDEX "job_applications_status_created_at_idx"
  ON "job_applications"("status", "created_at");

ALTER TABLE "job_applications"
  ADD CONSTRAINT "job_applications_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

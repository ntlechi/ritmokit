-- RitmoKit dance domain core
-- Extends Role RBAC; Station as room; SessionSeason / Course / ClassSession / Enrollment / InstructorPayrollLog

-- Role enum extensions
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'INSTRUCTOR';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FRONT_DESK';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STUDENT';

-- Dance enums
CREATE TYPE "DanceRole" AS ENUM ('LEAD', 'FOLLOW', 'SOLO');
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "SessionSeasonStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "InstructorPayType" AS ENUM ('HOURLY', 'FLAT_PER_CLASS', 'COMMISSION');
CREATE TYPE "InstructorPayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- Station room fields
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "stations" ADD COLUMN IF NOT EXISTS "surface_sqm" DOUBLE PRECISION;

-- User instructor / student profile fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" "Locale" NOT NULL DEFAULT 'FR';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "instructor_pay_type" "InstructorPayType";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "instructor_pay_rate" DECIMAL(10, 2);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Session seasons
CREATE TABLE IF NOT EXISTS "session_seasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SessionSeasonStatus" NOT NULL DEFAULT 'DRAFT',
    "booking_open" BOOLEAN NOT NULL DEFAULT false,
    "publish_on" DATE,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_seasons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "session_seasons_location_id_status_idx" ON "session_seasons"("location_id", "status");

ALTER TABLE "session_seasons"
  DROP CONSTRAINT IF EXISTS "session_seasons_location_id_fkey";
ALTER TABLE "session_seasons"
  ADD CONSTRAINT "session_seasons_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Courses
CREATE TABLE IF NOT EXISTS "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "level" "CourseLevel" NOT NULL DEFAULT 'BEGINNER',
    "style" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "courses_organization_id_style_level_idx" ON "courses"("organization_id", "style", "level");

ALTER TABLE "courses"
  DROP CONSTRAINT IF EXISTS "courses_organization_id_fkey";
ALTER TABLE "courses"
  ADD CONSTRAINT "courses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Class sessions
CREATE TABLE IF NOT EXISTS "class_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID,
    "course_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "day_of_week" INTEGER,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "max_leads" INTEGER NOT NULL DEFAULT 12,
    "max_follows" INTEGER NOT NULL DEFAULT 12,
    "price_regular" DECIMAL(10, 2) NOT NULL,
    "price_couple" DECIMAL(10, 2),
    "price_student" DECIMAL(10, 2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_sessions_season_id_day_of_week_start_time_idx" ON "class_sessions"("season_id", "day_of_week", "start_time");
CREATE INDEX IF NOT EXISTS "class_sessions_room_id_start_time_end_time_idx" ON "class_sessions"("room_id", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "class_sessions_instructor_id_start_time_idx" ON "class_sessions"("instructor_id", "start_time");

ALTER TABLE "class_sessions"
  DROP CONSTRAINT IF EXISTS "class_sessions_season_id_fkey";
ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_season_id_fkey"
  FOREIGN KEY ("season_id") REFERENCES "session_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "class_sessions"
  DROP CONSTRAINT IF EXISTS "class_sessions_course_id_fkey";
ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_sessions"
  DROP CONSTRAINT IF EXISTS "class_sessions_room_id_fkey";
ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_sessions"
  DROP CONSTRAINT IF EXISTS "class_sessions_instructor_id_fkey";
ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_instructor_id_fkey"
  FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enrollments
CREATE TABLE IF NOT EXISTS "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "dance_role" "DanceRole" NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "payment_ref" TEXT,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "waitlisted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "enrollments_session_id_student_id_key" ON "enrollments"("session_id", "student_id");
CREATE INDEX IF NOT EXISTS "enrollments_session_id_dance_role_waitlisted_idx" ON "enrollments"("session_id", "dance_role", "waitlisted");

ALTER TABLE "enrollments"
  DROP CONSTRAINT IF EXISTS "enrollments_session_id_fkey";
ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollments"
  DROP CONSTRAINT IF EXISTS "enrollments_student_id_fkey";
ALTER TABLE "enrollments"
  ADD CONSTRAINT "enrollments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Instructor payroll logs (dance profitability; separate from Nethris PayrollExport)
CREATE TABLE IF NOT EXISTS "instructor_payroll_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "instructor_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "total_classes" INTEGER NOT NULL DEFAULT 0,
    "total_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross_pay" DECIMAL(12, 2) NOT NULL,
    "status" "InstructorPayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_payroll_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "instructor_payroll_logs_instructor_id_period_start_period_end_idx"
  ON "instructor_payroll_logs"("instructor_id", "period_start", "period_end");

ALTER TABLE "instructor_payroll_logs"
  DROP CONSTRAINT IF EXISTS "instructor_payroll_logs_instructor_id_fkey";
ALTER TABLE "instructor_payroll_logs"
  ADD CONSTRAINT "instructor_payroll_logs_instructor_id_fkey"
  FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

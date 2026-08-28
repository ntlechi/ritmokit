-- Student evolution: weekly attendance + ready-for-next-level.

CREATE TYPE "ProgressionStatus" AS ENUM ('IN_PROGRESS', 'READY_TO_ADVANCE', 'COMPLETED', 'NEEDS_REVIEW');

CREATE TABLE "student_progressions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "dance_style" TEXT NOT NULL,
    "current_level" "CourseLevel" NOT NULL,
    "dance_role" "DanceRole",
    "status" "ProgressionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attendance_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attended_count" INTEGER NOT NULL DEFAULT 0,
    "expected_weeks" INTEGER NOT NULL DEFAULT 1,
    "instructor_note" TEXT,
    "evaluated_by_id" UUID,
    "evaluated_at" TIMESTAMP(3),
    "invite_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_progressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_progressions_student_id_course_id_season_id_key" ON "student_progressions"("student_id", "course_id", "season_id");
CREATE INDEX "student_progressions_location_id_status_idx" ON "student_progressions"("location_id", "status");
CREATE INDEX "student_progressions_student_id_dance_style_idx" ON "student_progressions"("student_id", "dance_style");
CREATE INDEX "student_progressions_location_id_dance_style_status_idx" ON "student_progressions"("location_id", "dance_style", "status");

ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "session_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "class_attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "occurred_on" DATE NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_attendance_enrollment_id_occurred_on_key" ON "class_attendance"("enrollment_id", "occurred_on");
CREATE INDEX "class_attendance_enrollment_id_occurred_on_idx" ON "class_attendance"("enrollment_id", "occurred_on");

ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

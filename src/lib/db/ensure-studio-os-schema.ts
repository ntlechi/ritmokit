import "server-only";

import { prisma } from "@/lib/prisma";

type TableRow = { exists: boolean };

let ready = false;
let inflight: Promise<{ applied: string[] }> | null = null;

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<TableRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function exec(sql: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|duplicate/i.test(message)) return;
    throw error;
  }
}

async function recordMigration(name: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations" (
          id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
        )
        SELECT gen_random_uuid()::text, 'runtime-bootstrap', NOW(), '${name}', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '${name}'
        )`,
    );
  } catch (error) {
    console.error("[schema] record migration", name, error);
  }
}

/**
 * Apply CRM / class-plan / progression tables if Vercel never ran migrate deploy.
 * Safe to call on every request — no-ops after the first success per isolate.
 */
export async function ensureStudioOsSchema(): Promise<{ applied: string[] }> {
  if (ready) return { applied: [] };
  if (inflight) return inflight;

  inflight = (async () => {
    const applied: string[] = [];

    if (!(await tableExists("course_lessons"))) {
      await exec(`
        CREATE TABLE IF NOT EXISTS "course_lessons" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "course_id" UUID NOT NULL,
          "week_number" INTEGER NOT NULL,
          "title" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "video_url" TEXT,
          "music_note" TEXT,
          "lead_focus" TEXT,
          "follow_focus" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "course_lessons_pkey" PRIMARY KEY ("id")
        )`);
      await exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "course_lessons_course_id_week_number_key" ON "course_lessons"("course_id", "week_number")`,
      );
      await exec(
        `CREATE INDEX IF NOT EXISTS "course_lessons_course_id_week_number_idx" ON "course_lessons"("course_id", "week_number")`,
      );
      await exec(
        `ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      applied.push("course_lessons");
    }

    if (!(await tableExists("student_notes"))) {
      await exec(`
        CREATE TABLE IF NOT EXISTS "student_notes" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "student_id" UUID NOT NULL,
          "location_id" UUID NOT NULL,
          "author_id" UUID NOT NULL,
          "body" TEXT NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
        )`);
      await exec(
        `CREATE INDEX IF NOT EXISTS "student_notes_student_id_location_id_created_at_idx" ON "student_notes"("student_id", "location_id", "created_at")`,
      );
      await exec(
        `CREATE INDEX IF NOT EXISTS "student_notes_location_id_created_at_idx" ON "student_notes"("location_id", "created_at")`,
      );
      await exec(
        `ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await exec(
        `ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await exec(
        `ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
      applied.push("student_notes");
    }

    if (applied.includes("course_lessons") || applied.includes("student_notes")) {
      await recordMigration("20260828140000_student_crm_course_lessons");
    }

    if (!(await tableExists("student_progressions"))) {
      await exec(`
        DO $$ BEGIN
          CREATE TYPE "ProgressionStatus" AS ENUM ('IN_PROGRESS', 'READY_TO_ADVANCE', 'COMPLETED', 'NEEDS_REVIEW');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$`);
      await exec(`
        CREATE TABLE IF NOT EXISTS "student_progressions" (
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
        )`);
      await exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "student_progressions_student_id_course_id_season_id_key" ON "student_progressions"("student_id", "course_id", "season_id")`,
      );
      await exec(
        `CREATE INDEX IF NOT EXISTS "student_progressions_location_id_status_idx" ON "student_progressions"("location_id", "status")`,
      );
      await exec(
        `CREATE INDEX IF NOT EXISTS "student_progressions_student_id_dance_style_idx" ON "student_progressions"("student_id", "dance_style")`,
      );
      await exec(
        `CREATE INDEX IF NOT EXISTS "student_progressions_location_id_dance_style_status_idx" ON "student_progressions"("location_id", "dance_style", "status")`,
      );
      await exec(
        `ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await exec(
        `ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await exec(
        `ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "session_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await exec(
        `ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      await exec(
        `ALTER TABLE "student_progressions" ADD CONSTRAINT "student_progressions_evaluated_by_id_fkey" FOREIGN KEY ("evaluated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
      );
      applied.push("student_progressions");
    }

    if (!(await tableExists("class_attendance"))) {
      await exec(`
        CREATE TABLE IF NOT EXISTS "class_attendance" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "enrollment_id" UUID NOT NULL,
          "occurred_on" DATE NOT NULL,
          "attended" BOOLEAN NOT NULL DEFAULT true,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "class_attendance_pkey" PRIMARY KEY ("id")
        )`);
      await exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "class_attendance_enrollment_id_occurred_on_key" ON "class_attendance"("enrollment_id", "occurred_on")`,
      );
      await exec(
        `CREATE INDEX IF NOT EXISTS "class_attendance_enrollment_id_occurred_on_idx" ON "class_attendance"("enrollment_id", "occurred_on")`,
      );
      await exec(
        `ALTER TABLE "class_attendance" ADD CONSTRAINT "class_attendance_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
      applied.push("class_attendance");
    }

    if (applied.includes("student_progressions") || applied.includes("class_attendance")) {
      await recordMigration("20260828150000_student_progression");
    }

    ready = true;
    return { applied };
  })();

  try {
    return await inflight;
  } catch (error) {
    inflight = null;
    console.error("[schema] ensure studio OS", error);
    throw error;
  }
}

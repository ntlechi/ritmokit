-- CreateEnum
CREATE TYPE "OnboardingTaskKey" AS ENUM ('UNIFORM_AND_PWA', 'FLOOR_FEEDBACK_J7', 'INTEGRATION_REVIEW_J30');

-- AlterTable
ALTER TABLE "employee_hr_profiles" ADD COLUMN     "buddy_id" UUID,
ADD COLUMN     "integration_started_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "onboarding_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_key" "OnboardingTaskKey" NOT NULL,
    "due_date" DATE NOT NULL,
    "completed_at" TIMESTAMP(3),
    "completed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_tasks_location_id_due_date_idx" ON "onboarding_tasks"("location_id", "due_date");

-- CreateIndex
CREATE INDEX "onboarding_tasks_user_id_completed_at_idx" ON "onboarding_tasks"("user_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_tasks_location_id_user_id_task_key_key" ON "onboarding_tasks"("location_id", "user_id", "task_key");

-- AddForeignKey
ALTER TABLE "employee_hr_profiles" ADD CONSTRAINT "employee_hr_profiles_buddy_id_fkey" FOREIGN KEY ("buddy_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "employee_availabilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_availabilities_profile_id_day_of_week_idx" ON "employee_availabilities"("profile_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "employee_availabilities" ADD CONSTRAINT "employee_availabilities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

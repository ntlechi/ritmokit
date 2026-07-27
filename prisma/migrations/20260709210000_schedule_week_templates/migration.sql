-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_template_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minutes" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "station_id" UUID NOT NULL,
    "period" "ShiftPeriod" NOT NULL DEFAULT 'DAY',
    "employee_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "schedule_template_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_templates_location_id_updated_at_idx" ON "schedule_templates"("location_id", "updated_at");

-- CreateIndex
CREATE INDEX "schedule_template_shifts_template_id_day_of_week_idx" ON "schedule_template_shifts"("template_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_template_shifts" ADD CONSTRAINT "schedule_template_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

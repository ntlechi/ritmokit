-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('JUNIOR', 'AUTONOME', 'LEAD');

-- CreateTable
CREATE TABLE "employee_station_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "station" "Station" NOT NULL,
    "level" "SkillLevel" NOT NULL DEFAULT 'JUNIOR',
    "notes" TEXT,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_station_skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_station_skills_location_id_station_level_idx" ON "employee_station_skills"("location_id", "station", "level");

-- CreateIndex
CREATE UNIQUE INDEX "employee_station_skills_location_id_user_id_station_key" ON "employee_station_skills"("location_id", "user_id", "station");

-- AddForeignKey
ALTER TABLE "employee_station_skills" ADD CONSTRAINT "employee_station_skills_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_station_skills" ADD CONSTRAINT "employee_station_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_station_skills" ADD CONSTRAINT "employee_station_skills_assessed_by_id_fkey" FOREIGN KEY ("assessed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

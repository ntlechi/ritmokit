-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "is_auto_generated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "staffing_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "station" "Station" NOT NULL,
    "target_splh" DECIMAL(10,2) NOT NULL,
    "sales_share_percent" DECIMAL(5,2) NOT NULL,
    "min_headcount" INTEGER NOT NULL DEFAULT 1,
    "max_headcount" INTEGER NOT NULL DEFAULT 6,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staffing_profiles_location_id_station_key" ON "staffing_profiles"("location_id", "station");

-- AddForeignKey
ALTER TABLE "staffing_profiles" ADD CONSTRAINT "staffing_profiles_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

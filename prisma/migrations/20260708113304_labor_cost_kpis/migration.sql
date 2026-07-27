-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "actual_ends_at" TIMESTAMP(3),
ADD COLUMN     "actual_starts_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hourly_sales_projections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hourly_sales_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hourly_sales_projections_location_id_day_of_week_hour_key" ON "hourly_sales_projections"("location_id", "day_of_week", "hour");

-- AddForeignKey
ALTER TABLE "hourly_sales_projections" ADD CONSTRAINT "hourly_sales_projections_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "geofence_radius_meters" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "break_ended_at" TIMESTAMP(3),
ADD COLUMN     "break_started_at" TIMESTAMP(3);

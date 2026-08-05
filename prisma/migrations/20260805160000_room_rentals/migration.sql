-- CreateEnum
CREATE TYPE "RentalBookingType" AS ENUM ('PRIVE', 'B2B', 'STAFF');

-- CreateEnum
CREATE TYPE "RentalBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalPaymentStatus" AS ENUM ('NONE', 'PENDING_APPROVAL', 'PENDING_INTERAC', 'PENDING_PAYPAL', 'PAID', 'WAIVED_STAFF', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalPaymentProvider" AS ENUM ('INTERAC', 'PAYPAL', 'CASH');

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "short_label" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_rental_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "open_hour" INTEGER NOT NULL DEFAULT 8,
    "close_hour" INTEGER NOT NULL DEFAULT 23,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "min_lead_hours" INTEGER NOT NULL DEFAULT 24,
    "b2b_requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "duration_options" INTEGER[] DEFAULT ARRAY[60, 90, 120, 180, 240]::INTEGER[],
    "module_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_rental_settings_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stations" ADD COLUMN "floor_id" UUID,
ADD COLUMN "rentable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hourly_rate_cents" INTEGER,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CAD',
ADD COLUMN "course_room_index" INTEGER,
ADD COLUMN "rental_description" TEXT,
ADD COLUMN "dimensions" TEXT,
ADD COLUMN "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "rental_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "time_start" TEXT NOT NULL,
    "time_end" TEXT NOT NULL,
    "type" "RentalBookingType" NOT NULL,
    "status" "RentalBookingStatus" NOT NULL,
    "payment_status" "RentalPaymentStatus" NOT NULL,
    "payment_provider" "RentalPaymentProvider",
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "client_name" TEXT NOT NULL,
    "client_email" TEXT NOT NULL,
    "client_phone" TEXT,
    "client_org" TEXT,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floors_location_id_sort_order_idx" ON "floors"("location_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "location_rental_settings_location_id_key" ON "location_rental_settings"("location_id");

-- CreateIndex
CREATE INDEX "stations_location_id_rentable_is_active_idx" ON "stations"("location_id", "rentable", "is_active");

-- CreateIndex
CREATE INDEX "stations_location_id_course_room_index_idx" ON "stations"("location_id", "course_room_index");

-- CreateIndex
CREATE INDEX "rental_bookings_location_id_status_date_idx" ON "rental_bookings"("location_id", "status", "date");

-- CreateIndex
CREATE INDEX "rental_bookings_room_id_date_status_idx" ON "rental_bookings"("room_id", "date", "status");

-- CreateIndex
CREATE INDEX "rental_bookings_location_id_payment_status_created_at_idx" ON "rental_bookings"("location_id", "payment_status", "created_at");

-- CreateIndex
CREATE INDEX "rental_bookings_location_id_type_status_created_at_idx" ON "rental_bookings"("location_id", "type", "status", "created_at");

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_rental_settings" ADD CONSTRAINT "location_rental_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

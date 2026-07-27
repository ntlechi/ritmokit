-- CreateEnum
CREATE TYPE "PosProvider" AS ENUM ('CLUSTER', 'SQUARE', 'CLOVER');

-- CreateTable
CREATE TABLE "pos_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "provider" "PosProvider" NOT NULL DEFAULT 'CLUSTER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "webhook_secret" TEXT NOT NULL,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales_hourly" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "net_sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tips_collected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sales_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_idempotency_logs" (
    "pos_order_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_idempotency_logs_pkey" PRIMARY KEY ("pos_order_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_integrations_location_id_key" ON "pos_integrations"("location_id");

-- CreateIndex
CREATE INDEX "pos_integrations_provider_external_id_idx" ON "pos_integrations"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_hourly_location_id_date_hour_key" ON "pos_sales_hourly"("location_id", "date", "hour");

-- AddForeignKey
ALTER TABLE "pos_integrations" ADD CONSTRAINT "pos_integrations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales_hourly" ADD CONSTRAINT "pos_sales_hourly_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

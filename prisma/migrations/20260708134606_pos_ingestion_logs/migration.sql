-- CreateEnum
CREATE TYPE "PosIngestionStatus" AS ENUM ('PROCESSED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "pos_ingestion_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "pos_order_id" TEXT NOT NULL,
    "net_sales" DECIMAL(10,2) NOT NULL,
    "tips_collected" DECIMAL(10,2) NOT NULL,
    "status" "PosIngestionStatus" NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_ingestion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_ingestion_logs_location_id_processed_at_idx" ON "pos_ingestion_logs"("location_id", "processed_at" DESC);

-- AddForeignKey
ALTER TABLE "pos_ingestion_logs" ADD CONSTRAINT "pos_ingestion_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

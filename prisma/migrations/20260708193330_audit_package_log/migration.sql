-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('CNESST', 'MAPAQ', 'FISCAL', 'FULL');

-- CreateTable
CREATE TABLE "audit_package_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "generated_by_id" UUID NOT NULL,
    "type" "AuditType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "file_name" TEXT NOT NULL,
    "package_data" BYTEA NOT NULL,
    "package_hash" VARCHAR(64) NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_package_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_package_logs_location_id_created_at_idx" ON "audit_package_logs"("location_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "audit_package_logs" ADD CONSTRAINT "audit_package_logs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_package_logs" ADD CONSTRAINT "audit_package_logs_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

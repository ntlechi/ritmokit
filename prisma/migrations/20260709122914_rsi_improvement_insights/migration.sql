-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('PULSE_ALERT', 'ROSTER_FRICTION', 'ONBOARDING_LAG', 'SHOUTOUT_SPIKE');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "improvement_insights" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "type" "InsightType" NOT NULL,
    "severity" "InsightSeverity" NOT NULL DEFAULT 'LOW',
    "fingerprint" VARCHAR(96) NOT NULL,
    "evidence" JSONB NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "action_link" VARCHAR(255) NOT NULL,
    "status" "InsightStatus" NOT NULL DEFAULT 'OPEN',
    "updated_by_id" UUID,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "improvement_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "improvement_insights_location_id_status_severity_idx" ON "improvement_insights"("location_id", "status", "severity");

-- CreateIndex
CREATE INDEX "improvement_insights_location_id_created_at_idx" ON "improvement_insights"("location_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "improvement_insights_location_id_fingerprint_key" ON "improvement_insights"("location_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "improvement_insights" ADD CONSTRAINT "improvement_insights_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "improvement_insights" ADD CONSTRAINT "improvement_insights_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'CONCLUDED_APPLIED', 'CONCLUDED_REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "ExperimentVariant" AS ENUM ('A', 'B');

-- CreateTable
CREATE TABLE "product_experiments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "hypothesis_key" VARCHAR(96) NOT NULL,
    "description_fr" TEXT NOT NULL,
    "description_en" TEXT NOT NULL,
    "description_es" TEXT NOT NULL,
    "target_metric" VARCHAR(64) NOT NULL,
    "lift_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "duration_days" INTEGER NOT NULL DEFAULT 28,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "config_variant_a" JSONB NOT NULL,
    "config_variant_b" JSONB NOT NULL,
    "started_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "result_json" JSONB,
    "avg_metric_a" DOUBLE PRECISION,
    "avg_metric_b" DOUBLE PRECISION,
    "lift_ratio" DOUBLE PRECISION,
    "concluded_at" TIMESTAMP(3),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "experiment_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "variant" "ExperimentVariant" NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_experiments_organization_id_status_idx" ON "product_experiments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "product_experiments_status_ends_at_idx" ON "product_experiments"("status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_experiments_organization_id_hypothesis_key_key" ON "product_experiments"("organization_id", "hypothesis_key");

-- CreateIndex
CREATE INDEX "experiment_allocations_location_id_idx" ON "experiment_allocations"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_allocations_experiment_id_location_id_key" ON "experiment_allocations"("experiment_id", "location_id");

-- AddForeignKey
ALTER TABLE "product_experiments" ADD CONSTRAINT "product_experiments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_experiments" ADD CONSTRAINT "product_experiments_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_allocations" ADD CONSTRAINT "experiment_allocations_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "product_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_allocations" ADD CONSTRAINT "experiment_allocations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

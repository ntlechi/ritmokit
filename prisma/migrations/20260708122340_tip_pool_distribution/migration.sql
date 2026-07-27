-- CreateTable
CREATE TABLE "tip_pool_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "voted_at" TIMESTAMP(3),
    "cuisine_points" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    "comptoir_points" DECIMAL(3,2) NOT NULL DEFAULT 1.2,
    "emballage_points" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tip_pool_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tip_distributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "distribution_date" DATE NOT NULL,
    "total_tips_collected" DECIMAL(10,2) NOT NULL,
    "total_weighted_hours" DECIMAL(10,4) NOT NULL,
    "value_per_point" DECIMAL(10,4) NOT NULL,
    "distributed_by_id" UUID NOT NULL,
    "distributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_tips_earned" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "distribution_id" UUID NOT NULL,
    "amount_paid" DECIMAL(10,2) NOT NULL,
    "weighted_score" DECIMAL(10,4) NOT NULL,
    "worked_hours" DECIMAL(6,2) NOT NULL,
    "station_points" DECIMAL(3,2) NOT NULL,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_tips_earned_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tip_pool_configs_location_id_key" ON "tip_pool_configs"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "tip_distributions_location_id_distribution_date_key" ON "tip_distributions"("location_id", "distribution_date");

-- CreateIndex
CREATE UNIQUE INDEX "shift_tips_earned_shift_id_key" ON "shift_tips_earned"("shift_id");

-- AddForeignKey
ALTER TABLE "tip_pool_configs" ADD CONSTRAINT "tip_pool_configs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_distributions" ADD CONSTRAINT "tip_distributions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_distributions" ADD CONSTRAINT "tip_distributions_distributed_by_id_fkey" FOREIGN KEY ("distributed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tips_earned" ADD CONSTRAINT "shift_tips_earned_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_tips_earned" ADD CONSTRAINT "shift_tips_earned_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "tip_distributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

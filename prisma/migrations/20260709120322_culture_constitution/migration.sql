-- AlterTable
ALTER TABLE "pulse_questions" ADD COLUMN     "value_key" VARCHAR(64);

-- CreateTable
CREATE TABLE "organization_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "value_key" VARCHAR(64) NOT NULL,
    "title_fr" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "title_es" TEXT NOT NULL,
    "behavior_fr" TEXT NOT NULL,
    "behavior_en" TEXT NOT NULL,
    "behavior_es" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_values_organization_id_is_active_sort_order_idx" ON "organization_values"("organization_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "organization_values_organization_id_value_key_key" ON "organization_values"("organization_id", "value_key");

-- CreateIndex
CREATE INDEX "pulse_questions_organization_id_value_key_idx" ON "pulse_questions"("organization_id", "value_key");

-- AddForeignKey
ALTER TABLE "organization_values" ADD CONSTRAINT "organization_values_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

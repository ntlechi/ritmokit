-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('INSURANCE', 'RETIREMENT', 'PERK', 'DOCUMENT');

-- CreateTable
CREATE TABLE "location_benefits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "external_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_benefits_location_id_is_active_idx" ON "location_benefits"("location_id", "is_active");

-- AddForeignKey
ALTER TABLE "location_benefits" ADD CONSTRAINT "location_benefits_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

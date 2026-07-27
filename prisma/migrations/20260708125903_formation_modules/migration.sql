-- CreateEnum
CREATE TYPE "FormationModuleKind" AS ENUM ('SOP', 'SAFETY', 'RECIPE', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "FormationProgressStatus" AS ENUM ('NOT_STARTED', 'COMPLETED');

-- CreateTable
CREATE TABLE "formation_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "location_id" UUID,
    "sop_id" UUID,
    "kind" "FormationModuleKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "station" "Station" NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "requires_signature" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formation_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_formation_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "status" "FormationProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "signature_name" TEXT,
    "signed_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_formation_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formation_modules_sop_id_key" ON "formation_modules"("sop_id");

-- CreateIndex
CREATE INDEX "formation_modules_organization_id_station_is_active_idx" ON "formation_modules"("organization_id", "station", "is_active");

-- CreateIndex
CREATE INDEX "formation_modules_location_id_station_is_active_idx" ON "formation_modules"("location_id", "station", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "employee_formation_progress_user_id_module_id_key" ON "employee_formation_progress"("user_id", "module_id");

-- AddForeignKey
ALTER TABLE "formation_modules" ADD CONSTRAINT "formation_modules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formation_modules" ADD CONSTRAINT "formation_modules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formation_modules" ADD CONSTRAINT "formation_modules_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_formation_progress" ADD CONSTRAINT "employee_formation_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_formation_progress" ADD CONSTRAINT "employee_formation_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "formation_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

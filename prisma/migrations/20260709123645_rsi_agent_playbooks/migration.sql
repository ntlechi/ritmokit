-- CreateEnum
CREATE TYPE "PlaybookStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "location_agent_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "agent_name" VARCHAR(64) NOT NULL,
    "settings" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_playbook_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "agent_name" VARCHAR(64) NOT NULL,
    "fingerprint" VARCHAR(96) NOT NULL,
    "current_config" JSONB NOT NULL,
    "proposed_config" JSONB NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "rationale_fr" TEXT NOT NULL,
    "rationale_en" TEXT NOT NULL,
    "rationale_es" TEXT NOT NULL,
    "status" "PlaybookStatus" NOT NULL DEFAULT 'SUGGESTED',
    "approved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_playbook_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_agent_configs_location_id_idx" ON "location_agent_configs"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_agent_configs_location_id_agent_name_key" ON "location_agent_configs"("location_id", "agent_name");

-- CreateIndex
CREATE INDEX "agent_playbook_proposals_location_id_status_idx" ON "agent_playbook_proposals"("location_id", "status");

-- CreateIndex
CREATE INDEX "agent_playbook_proposals_location_id_agent_name_status_idx" ON "agent_playbook_proposals"("location_id", "agent_name", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_playbook_proposals_location_id_fingerprint_key" ON "agent_playbook_proposals"("location_id", "fingerprint");

-- AddForeignKey
ALTER TABLE "location_agent_configs" ADD CONSTRAINT "location_agent_configs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_agent_configs" ADD CONSTRAINT "location_agent_configs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_playbook_proposals" ADD CONSTRAINT "agent_playbook_proposals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_playbook_proposals" ADD CONSTRAINT "agent_playbook_proposals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

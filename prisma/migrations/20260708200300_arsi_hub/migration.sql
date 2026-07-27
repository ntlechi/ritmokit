-- Hub Arsi: identifiant externe sur Sop, scope/version sur FormationModule, journal de sync

ALTER TABLE "sops" ADD COLUMN "arsi_id" TEXT;

ALTER TABLE "formation_modules" ADD COLUMN "scope" "SopScope" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "formation_modules" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "arsi_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "imported_by_id" UUID NOT NULL,
    "payload_size" INTEGER NOT NULL,
    "ops_count" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "invalidated_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arsi_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "arsi_sync_logs_organization_id_created_at_idx" ON "arsi_sync_logs"("organization_id", "created_at" DESC);

ALTER TABLE "arsi_sync_logs" ADD CONSTRAINT "arsi_sync_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "arsi_sync_logs" ADD CONSTRAINT "arsi_sync_logs_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sops_organization_id_arsi_id_key" ON "sops"("organization_id", "arsi_id");

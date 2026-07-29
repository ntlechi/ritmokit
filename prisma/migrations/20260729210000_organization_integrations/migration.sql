-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('PAYPAL', 'STRIPE', 'RESEND', 'SQUARE');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'TESTING', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "organization_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_config" TEXT NOT NULL,
    "webhook_secret" TEXT,
    "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_integrations_organization_id_idx" ON "organization_integrations"("organization_id");

-- CreateIndex
CREATE INDEX "organization_integrations_provider_status_idx" ON "organization_integrations"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_integrations_organization_id_provider_key" ON "organization_integrations"("organization_id", "provider");

-- AddForeignKey
ALTER TABLE "organization_integrations" ADD CONSTRAINT "organization_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_integrations" ADD CONSTRAINT "organization_integrations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

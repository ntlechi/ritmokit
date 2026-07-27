/*
  Warnings:

  - Added the required column `location_id` to the `shifts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SopScope" AS ENUM ('CORPORATE', 'LOCAL');

-- CreateEnum
CREATE TYPE "ChatChannelType" AS ENUM ('ANNOUNCEMENTS', 'STATION', 'SHIFT_GROUP', 'DIRECT');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'SYSTEM', 'AGENT', 'SOP_PIN', 'SHIFT_REQUEST');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OWNER';

-- CreateTable (org/location first — needed to backfill shifts)
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "locations_organization_id_slug_key" ON "locations"("organization_id", "slug");
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default Bati location for existing shift rows
INSERT INTO "organizations" ("id", "name", "slug", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000010', 'Bati', 'bati', CURRENT_TIMESTAMP);

INSERT INTO "locations" ("id", "organization_id", "name", "slug", "city", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000010', 'Bati — Québec', 'quebec', 'Québec', CURRENT_TIMESTAMP);

-- Add location_id nullable, backfill, then enforce NOT NULL
ALTER TABLE "shifts" ADD COLUMN "location_id" UUID;
UPDATE "shifts" SET "location_id" = '00000000-0000-0000-0000-000000000011' WHERE "location_id" IS NULL;
ALTER TABLE "shifts" ALTER COLUMN "location_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sops" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "location_id" UUID,
ADD COLUMN "organization_id" UUID,
ADD COLUMN "scope" "SopScope" NOT NULL DEFAULT 'CORPORATE',
ADD COLUMN "steps" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "location_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "station" "Station" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "hired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_channel_pins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sop_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "pinned_by_id" UUID NOT NULL,
    "pinned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sop_channel_pins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "type" "ChatChannelType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "station" "Station",
    "shift_id" UUID,
    "is_read_only" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_channel_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "can_post" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "chat_channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel_id" UUID,
    "conversation_id" UUID,
    "author_id" UUID NOT NULL,
    "content_type" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_members_user_id_idx" ON "location_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_members_location_id_user_id_key" ON "location_members"("location_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sop_channel_pins_sop_id_channel_id_key" ON "sop_channel_pins"("sop_id", "channel_id");

-- CreateIndex
CREATE INDEX "chat_channels_location_id_type_idx" ON "chat_channels"("location_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "chat_channels_location_id_slug_key" ON "chat_channels"("location_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "chat_channel_members_channel_id_user_id_key" ON "chat_channel_members"("channel_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_messages_channel_id_created_at_idx" ON "chat_messages"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "shifts_location_id_starts_at_idx" ON "shifts"("location_id", "starts_at");

-- CreateIndex
CREATE INDEX "sops_organization_id_station_idx" ON "sops"("organization_id", "station");

-- CreateIndex
CREATE INDEX "sops_location_id_station_idx" ON "sops"("location_id", "station");

-- AddForeignKey
ALTER TABLE "location_members" ADD CONSTRAINT "location_members_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_members" ADD CONSTRAINT "location_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_channel_pins" ADD CONSTRAINT "sop_channel_pins_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_channel_pins" ADD CONSTRAINT "sop_channel_pins_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_channel_pins" ADD CONSTRAINT "sop_channel_pins_pinned_by_id_fkey" FOREIGN KEY ("pinned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_channel_members" ADD CONSTRAINT "chat_channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_channel_members" ADD CONSTRAINT "chat_channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

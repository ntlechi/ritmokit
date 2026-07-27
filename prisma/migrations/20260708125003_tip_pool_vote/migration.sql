-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('DRAFT', 'VOTING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "tip_pool_configs" ADD COLUMN     "agreement_text" TEXT,
ADD COLUMN     "status" "VoteStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "tip_pool_votes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_approved" BOOLEAN NOT NULL,
    "signature_name" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "tip_pool_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tip_pool_votes_config_id_user_id_key" ON "tip_pool_votes"("config_id", "user_id");

-- AddForeignKey
ALTER TABLE "tip_pool_votes" ADD CONSTRAINT "tip_pool_votes_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "tip_pool_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_pool_votes" ADD CONSTRAINT "tip_pool_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

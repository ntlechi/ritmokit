-- AlterEnum
ALTER TYPE "ChatChannelType" ADD VALUE 'MANAGEMENT';

-- AlterTable
ALTER TABLE "agent_logs" ADD COLUMN     "related_message_id" UUID;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "late_arrival_flag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "late_arrival_minutes" INTEGER,
ADD COLUMN     "late_arrival_reported_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_related_message_id_fkey" FOREIGN KEY ("related_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

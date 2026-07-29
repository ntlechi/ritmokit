-- AlterTable: optional assistant instructor on class sessions (partner-dance dual staff)
ALTER TABLE "class_sessions" ADD COLUMN "assistant_id" UUID;

-- AddForeignKey
ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_assistant_id_fkey"
  FOREIGN KEY ("assistant_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "class_sessions_assistant_id_start_time_idx"
  ON "class_sessions"("assistant_id", "start_time");

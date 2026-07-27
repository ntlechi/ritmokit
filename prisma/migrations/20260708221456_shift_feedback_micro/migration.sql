-- CreateTable
CREATE TABLE "shift_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "rating_attitude" INTEGER NOT NULL,
    "rating_speed" INTEGER NOT NULL,
    "rating_reliability" INTEGER NOT NULL,
    "comment" VARCHAR(140),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_feedbacks_shift_id_key" ON "shift_feedbacks"("shift_id");

-- CreateIndex
CREATE INDEX "shift_feedbacks_employee_id_created_at_idx" ON "shift_feedbacks"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "shift_feedbacks_submitted_by_id_created_at_idx" ON "shift_feedbacks"("submitted_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "shift_feedbacks" ADD CONSTRAINT "shift_feedbacks_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_feedbacks" ADD CONSTRAINT "shift_feedbacks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_feedbacks" ADD CONSTRAINT "shift_feedbacks_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

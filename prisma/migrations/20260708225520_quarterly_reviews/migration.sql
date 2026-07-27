-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_SELF_EVALUATION', 'PENDING_MANAGER_INPUT', 'READY_FOR_REVIEW', 'SIGNED_AND_COMPLETED');

-- CreateTable
CREATE TABLE "quarterly_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "manager_id" UUID,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING_SELF_EVALUATION',
    "period_end_date" DATE NOT NULL,
    "employee_self_score" INTEGER,
    "employee_comments" TEXT,
    "employee_attitude" INTEGER,
    "employee_culture" INTEGER,
    "employee_station_goals" INTEGER,
    "manager_score" INTEGER,
    "manager_comments" TEXT,
    "manager_attitude" INTEGER,
    "manager_culture" INTEGER,
    "manager_station_goals" INTEGER,
    "future_goals" TEXT,
    "feedback_avg_attitude" DOUBLE PRECISION,
    "feedback_avg_speed" DOUBLE PRECISION,
    "feedback_avg_reliability" DOUBLE PRECISION,
    "feedback_avg_overall" DOUBLE PRECISION,
    "feedback_count" INTEGER,
    "employee_signed_at" TIMESTAMP(3),
    "employee_signature_ip" VARCHAR(45),
    "employee_signature_name" TEXT,
    "manager_signed_at" TIMESTAMP(3),
    "manager_signature_ip" VARCHAR(45),
    "manager_signature_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quarterly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quarterly_reviews_employee_id_status_idx" ON "quarterly_reviews"("employee_id", "status");

-- CreateIndex
CREATE INDEX "quarterly_reviews_location_id_status_idx" ON "quarterly_reviews"("location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quarterly_reviews_location_id_employee_id_period_end_date_key" ON "quarterly_reviews"("location_id", "employee_id", "period_end_date");

-- AddForeignKey
ALTER TABLE "quarterly_reviews" ADD CONSTRAINT "quarterly_reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarterly_reviews" ADD CONSTRAINT "quarterly_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarterly_reviews" ADD CONSTRAINT "quarterly_reviews_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

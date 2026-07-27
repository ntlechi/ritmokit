-- CreateTable
CREATE TABLE "pulse_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "text_fr" TEXT NOT NULL,
    "text_en" TEXT NOT NULL,
    "text_es" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pulse_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pulse_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "station" "Station" NOT NULL,
    "score" INTEGER NOT NULL,
    "week_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "question_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pulse_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pulse_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pulse_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pulse_questions_organization_id_is_active_idx" ON "pulse_questions"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "pulse_questions_organization_id_week_number_year_key" ON "pulse_questions"("organization_id", "week_number", "year");

-- CreateIndex
CREATE INDEX "pulse_responses_location_id_year_week_number_idx" ON "pulse_responses"("location_id", "year", "week_number");

-- CreateIndex
CREATE INDEX "pulse_responses_location_id_station_year_week_number_idx" ON "pulse_responses"("location_id", "station", "year", "week_number");

-- CreateIndex
CREATE INDEX "pulse_receipts_question_id_idx" ON "pulse_receipts"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "pulse_receipts_user_id_year_week_number_key" ON "pulse_receipts"("user_id", "year", "week_number");

-- AddForeignKey
ALTER TABLE "pulse_questions" ADD CONSTRAINT "pulse_questions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pulse_responses" ADD CONSTRAINT "pulse_responses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pulse_receipts" ADD CONSTRAINT "pulse_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pulse_receipts" ADD CONSTRAINT "pulse_receipts_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "pulse_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

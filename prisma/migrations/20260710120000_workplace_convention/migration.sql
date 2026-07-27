-- CreateEnum
CREATE TYPE "DisciplineStep" AS ENUM ('VERBAL_COACHING', 'WRITTEN_FIRST', 'WRITTEN_SECOND_SUSPENSION', 'TERMINATION', 'GROSS_MISCONDUCT');

-- CreateTable
CREATE TABLE "workplace_convention_signatures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "signature_name" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "ip_address" VARCHAR(45),
    "employee_comment" TEXT,

    CONSTRAINT "workplace_convention_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "infraction_code" VARCHAR(64) NOT NULL,
    "discipline_step" "DisciplineStep" NOT NULL,
    "culture_value_key" VARCHAR(32),
    "facts" TEXT NOT NULL,
    "manager_notes" TEXT,
    "manager_script" TEXT,
    "employee_comment" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "requires_employee_signature" BOOLEAN NOT NULL DEFAULT false,
    "employee_signature_name" TEXT,
    "employee_signed_at" TIMESTAMP(3),
    "employee_signature_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disciplinary_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workplace_convention_signatures_version_signed_at_idx" ON "workplace_convention_signatures"("version", "signed_at");

-- CreateIndex
CREATE UNIQUE INDEX "workplace_convention_signatures_user_id_version_key" ON "workplace_convention_signatures"("user_id", "version");

-- CreateIndex
CREATE INDEX "disciplinary_records_location_id_employee_id_infraction_code_idx" ON "disciplinary_records"("location_id", "employee_id", "infraction_code", "occurred_at");

-- CreateIndex
CREATE INDEX "disciplinary_records_employee_id_occurred_at_idx" ON "disciplinary_records"("employee_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "workplace_convention_signatures" ADD CONSTRAINT "workplace_convention_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_records" ADD CONSTRAINT "disciplinary_records_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_records" ADD CONSTRAINT "disciplinary_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_records" ADD CONSTRAINT "disciplinary_records_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

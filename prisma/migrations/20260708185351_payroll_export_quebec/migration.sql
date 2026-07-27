-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayrollExportFormat" AS ENUM ('NETHRIS', 'PAYWORKS');

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "locked_by_id" UUID,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pay_period_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "station" "Station" NOT NULL,
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "regular_hours" DECIMAL(6,2) NOT NULL,
    "overtime_hours" DECIMAL(6,2) NOT NULL,
    "regular_pay" DECIMAL(10,2) NOT NULL,
    "overtime_pay" DECIMAL(10,2) NOT NULL,
    "tips_amount" DECIMAL(10,2) NOT NULL,
    "gross_pay" DECIMAL(10,2) NOT NULL,
    "shift_count" INTEGER NOT NULL DEFAULT 0,
    "incomplete_punch_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pay_period_id" UUID NOT NULL,
    "format" "PayrollExportFormat" NOT NULL,
    "file_name" TEXT NOT NULL,
    "csv_content" TEXT NOT NULL,
    "line_item_count" INTEGER NOT NULL,
    "exported_by_id" UUID NOT NULL,
    "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_periods_location_id_status_idx" ON "pay_periods"("location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pay_periods_location_id_start_date_end_date_key" ON "pay_periods"("location_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_line_items_pay_period_id_user_id_key" ON "payroll_line_items"("pay_period_id", "user_id");

-- CreateIndex
CREATE INDEX "payroll_exports_pay_period_id_idx" ON "payroll_exports"("pay_period_id");

-- AddForeignKey
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_exported_by_id_fkey" FOREIGN KEY ("exported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

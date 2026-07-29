-- RitmoKit studio payroll: tips pool retired — gross pay is regular + overtime only.

ALTER TABLE "payroll_line_items" DROP COLUMN IF EXISTS "tips_amount";

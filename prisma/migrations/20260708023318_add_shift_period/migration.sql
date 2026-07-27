-- CreateEnum
CREATE TYPE "ShiftPeriod" AS ENUM ('DAY', 'NIGHT');

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "period" "ShiftPeriod" NOT NULL DEFAULT 'DAY';

-- Code Rouge: urgency + surge bonus + emergency bids (instant marketplace liquidity)

CREATE TYPE "ShiftUrgency" AS ENUM ('NORMAL', 'CODE_RED');
CREATE TYPE "EmergencyBidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'MISSED', 'EXPIRED');

ALTER TABLE "shifts"
  ADD COLUMN "urgency" "ShiftUrgency" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "surge_bonus" DECIMAL(10, 2),
  ADD COLUMN "code_red_at" TIMESTAMP(3),
  ADD COLUMN "code_red_by_id" UUID;

ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_code_red_by_id_fkey"
  FOREIGN KEY ("code_red_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "shifts_urgency_starts_at_idx" ON "shifts"("urgency", "starts_at");

CREATE TABLE "emergency_bids" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shift_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "EmergencyBidStatus" NOT NULL DEFAULT 'PENDING',
  "notified_at" TIMESTAMP(3),
  "responded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "emergency_bids_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emergency_bids_shift_id_user_id_key" ON "emergency_bids"("shift_id", "user_id");
CREATE INDEX "emergency_bids_user_id_status_idx" ON "emergency_bids"("user_id", "status");
CREATE INDEX "emergency_bids_shift_id_status_idx" ON "emergency_bids"("shift_id", "status");

ALTER TABLE "emergency_bids"
  ADD CONSTRAINT "emergency_bids_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emergency_bids"
  ADD CONSTRAINT "emergency_bids_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

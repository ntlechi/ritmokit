-- Retire QSR-only modules (Code Rouge, tips pool, POS, staffing profiles, careers).

DROP TABLE IF EXISTS "shift_tips_earned";
DROP TABLE IF EXISTS "tip_distributions";
DROP TABLE IF EXISTS "tip_pool_votes";
DROP TABLE IF EXISTS "tip_pool_configs";
DROP TABLE IF EXISTS "emergency_bids";
DROP TABLE IF EXISTS "pos_ingestion_logs";
DROP TABLE IF EXISTS "pos_channel_sales_daily";
DROP TABLE IF EXISTS "pos_sales_hourly";
DROP TABLE IF EXISTS "pos_integrations";
DROP TABLE IF EXISTS "pos_idempotency_logs";
DROP TABLE IF EXISTS "staffing_profiles";
DROP TABLE IF EXISTS "hourly_sales_projections";
DROP TABLE IF EXISTS "job_applications";

ALTER TABLE "shifts" DROP CONSTRAINT IF EXISTS "shifts_code_red_by_id_fkey";
DROP INDEX IF EXISTS "shifts_urgency_starts_at_idx";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "urgency";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "surge_bonus";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "code_red_at";
ALTER TABLE "shifts" DROP COLUMN IF EXISTS "code_red_by_id";

ALTER TABLE "stations" DROP COLUMN IF EXISTS "tip_points";
ALTER TABLE "locations" DROP COLUMN IF EXISTS "food_cost_pct";

DROP TYPE IF EXISTS "ShiftUrgency";
DROP TYPE IF EXISTS "EmergencyBidStatus";

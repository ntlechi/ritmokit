-- Mirok Autopilot — loop engineering audit trail
CREATE TYPE "AutopilotLoopKind" AS ENUM ('LABOR_COST', 'CODE_RED_SURGE', 'PULSE_CULTURE');
CREATE TYPE "AutopilotLoopOutcome" AS ENUM ('MEASURED', 'PROPOSED', 'NO_ACTION', 'FAILED');

CREATE TABLE "autopilot_loop_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "loop_kind" "AutopilotLoopKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "week_number" INTEGER NOT NULL,
    "metric_name" VARCHAR(64) NOT NULL,
    "metric_value" DECIMAL(10, 4),
    "target_value" DECIMAL(10, 4),
    "delta_value" DECIMAL(10, 4),
    "outcome" "AutopilotLoopOutcome" NOT NULL DEFAULT 'MEASURED',
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autopilot_loop_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "autopilot_loop_runs_location_loop_week_key"
    ON "autopilot_loop_runs"("location_id", "loop_kind", "year", "week_number");

CREATE INDEX "autopilot_loop_runs_location_created_idx"
    ON "autopilot_loop_runs"("location_id", "created_at");

ALTER TABLE "autopilot_loop_runs"
    ADD CONSTRAINT "autopilot_loop_runs_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RSI insight: labor cost loop alerts
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'LABOR_COST_ALERT';

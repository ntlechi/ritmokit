-- Punch PIN re-architecture: per-user salt + force re-enrollment
-- Old unsalted SHA-256 hashes cannot be upgraded without plaintext → null them out.

ALTER TABLE "employee_hr_profiles"
    ADD COLUMN "punch_pin_salt" TEXT;

UPDATE "employee_hr_profiles"
SET "punch_pin_hash" = NULL
WHERE "punch_pin_hash" IS NOT NULL;

-- Durable punch attempt audit (replaces in-process failBucket Map)
CREATE TABLE "punch_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "client_fingerprint" VARCHAR(128) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "matched_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "punch_attempts_location_fingerprint_created_idx"
    ON "punch_attempts"("location_id", "client_fingerprint", "created_at");

CREATE INDEX "punch_attempts_location_created_idx"
    ON "punch_attempts"("location_id", "created_at");

ALTER TABLE "punch_attempts"
    ADD CONSTRAINT "punch_attempts_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "punch_attempts"
    ADD CONSTRAINT "punch_attempts_matched_user_id_fkey"
    FOREIGN KEY ("matched_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- /goal convergence engine
CREATE TYPE "GoalDirection" AS ENUM ('INCREASE', 'DECREASE');
CREATE TYPE "GoalState" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ACHIEVED', 'BREACHED', 'STALLED');

CREATE TABLE "operational_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "metric_key" VARCHAR(64) NOT NULL,
    "current_value" DECIMAL(12, 4) NOT NULL,
    "target_value" DECIMAL(12, 4) NOT NULL,
    "start_value" DECIMAL(12, 4) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline_at" DATE NOT NULL,
    "direction" "GoalDirection" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "owner_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operational_goals_location_active_idx"
    ON "operational_goals"("location_id", "is_active");

CREATE INDEX "operational_goals_location_metric_idx"
    ON "operational_goals"("location_id", "metric_key");

ALTER TABLE "operational_goals"
    ADD CONSTRAINT "operational_goals_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_goals"
    ADD CONSTRAINT "operational_goals_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "goal_tactical_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "goal_id" UUID NOT NULL,
    "evaluation_day" DATE NOT NULL,
    "current_value" DECIMAL(12, 4) NOT NULL,
    "start_value" DECIMAL(12, 4) NOT NULL,
    "target_value" DECIMAL(12, 4) NOT NULL,
    "tau" DECIMAL(8, 6) NOT NULL,
    "drift" DECIMAL(8, 6) NOT NULL,
    "rate_deficit_ratio" DECIMAL(12, 4),
    "projected_deadline" DATE,
    "state" "GoalState" NOT NULL,
    "prior_state" "GoalState",
    "action_version" VARCHAR(32) NOT NULL,
    "script" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_tactical_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goal_tactical_logs_goal_day_key"
    ON "goal_tactical_logs"("goal_id", "evaluation_day");

CREATE INDEX "goal_tactical_logs_goal_created_idx"
    ON "goal_tactical_logs"("goal_id", "created_at");

ALTER TABLE "goal_tactical_logs"
    ADD CONSTRAINT "goal_tactical_logs_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "operational_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

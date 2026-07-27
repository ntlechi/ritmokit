-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('FR', 'EN', 'ES');

-- CreateEnum
CREATE TYPE "Station" AS ENUM ('CUISINE', 'COMPTOIR', 'EMBALLAGE');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CRISIS_ALERT');

-- CreateEnum
CREATE TYPE "SwapRequestStatus" AS ENUM ('PENDING', 'AGENT_NEGOTIATING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "preferred_language" "Locale" NOT NULL DEFAULT 'FR',
    "hourly_rate" DECIMAL(10,2) NOT NULL,
    "station" "Station" NOT NULL,
    "max_hours_per_week" INTEGER NOT NULL DEFAULT 40,
    "phone" TEXT,
    "hired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "station" "Station" NOT NULL,
    "employee_id" UUID,
    "created_by_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "break_required_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "published_at" TIMESTAMP(3),
    "weekly_hours_snapshot" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overtime_flag" BOOLEAN NOT NULL DEFAULT false,
    "rest_violation_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_swap_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shift_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "target_employee_id" UUID,
    "status" "SwapRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by_agent" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "station" "Station",
    "role" "Role",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "station" "Station",
    "role" "Role",
    "sop_id" UUID,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "channel" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "correlation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "related_shift_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_profiles_user_id_key" ON "employee_profiles"("user_id");

-- CreateIndex
CREATE INDEX "shifts_employee_id_starts_at_idx" ON "shifts"("employee_id", "starts_at");

-- CreateIndex
CREATE INDEX "shifts_station_starts_at_idx" ON "shifts"("station", "starts_at");

-- CreateIndex
CREATE INDEX "shift_swap_requests_shift_id_idx" ON "shift_swap_requests"("shift_id");

-- CreateIndex
CREATE INDEX "agent_logs_channel_status_idx" ON "agent_logs"("channel", "status");

-- CreateIndex
CREATE INDEX "agent_logs_correlation_id_idx" ON "agent_logs"("correlation_id");

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_target_employee_id_fkey" FOREIGN KEY ("target_employee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_related_shift_id_fkey" FOREIGN KEY ("related_shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

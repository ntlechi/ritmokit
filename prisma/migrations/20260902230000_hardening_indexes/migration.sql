-- Backend hardening: indexes for the door / caisse / evolution hot paths.
-- All `IF NOT EXISTS` so the runtime bootstrap (`ensureStudioOsSchema`) and
-- `prisma migrate deploy` can both apply it safely.
--
-- Note: Prisma migrations run inside a transaction, so CONCURRENTLY is not
-- available here. On a large `enrollments` table apply these out-of-band with
-- `CREATE INDEX CONCURRENTLY` first; this migration then becomes a no-op.

-- Student-side FK lookups (progression recompute, student profile, Loi 25 export).
CREATE INDEX IF NOT EXISTS "enrollments_student_id_idx"
  ON "enrollments"("student_id");

-- Clôture de caisse: SUM(amount_cad) of cash taken inside tonight's window.
CREATE INDEX IF NOT EXISTS "enrollments_payment_provider_paid_at_idx"
  ON "enrollments"("payment_provider", "paid_at");

-- Clôture de caisse: Interac announced at the door tonight.
CREATE INDEX IF NOT EXISTS "enrollments_payment_provider_payment_pending_at_idx"
  ON "enrollments"("payment_provider", "payment_pending_at");

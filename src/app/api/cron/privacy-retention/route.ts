import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepInactiveStudents } from "@/lib/privacy/anonymize-student";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/privacy-retention?days=1095&batch=200
 * Loi 25 retention sweep — pseudonymizes students inactive past the horizon.
 * Idempotent and bounded; schedule nightly.
 */
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "");
  const batch = Number(url.searchParams.get("batch") ?? "");

  const result = await sweepInactiveStudents({
    inactiveDays: Number.isFinite(days) && days >= 365 ? days : undefined,
    batchSize: Number.isFinite(batch) && batch > 0 ? batch : undefined,
  });
  return NextResponse.json({ ok: true, ...result });
}

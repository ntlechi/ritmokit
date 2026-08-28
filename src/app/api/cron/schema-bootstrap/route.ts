import { NextResponse } from "next/server";
import { ensureStudioOsSchema } from "@/lib/db/ensure-studio-os-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One-shot / idempotent: create CRM + progression tables if migrate deploy never ran. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await ensureStudioOsSchema();
  return NextResponse.json({ ok: true, ...result });
}

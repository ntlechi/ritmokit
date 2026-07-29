import { NextResponse } from "next/server";
import { runDanceAgenticsCron } from "@/lib/dance/agentics-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dance agentics cron — unpaid promote chase + churn risk cards.
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Suggested: every hour.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runDanceAgenticsCron();
  return NextResponse.json({ ok: true, ...result });
}

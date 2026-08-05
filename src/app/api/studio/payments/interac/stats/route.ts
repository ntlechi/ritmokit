import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getInteracStats } from "@/lib/payments/interac";

export const runtime = "nodejs";

/** GET /api/studio/payments/interac/stats */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await getInteracStats({ userId: user.id, role: user.role });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, stats: result.stats });
}

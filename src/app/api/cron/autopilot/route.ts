import { NextResponse } from "next/server";
import { syncOperationalGoalsForAllLocations } from "@/lib/autopilot/goal-engine";
import { syncAutopilotForAllLocations } from "@/lib/autopilot/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron hebdomadaire — boucles Autopilot A–F puis moteur /goal (convergence déterministe).
 * Sécurisé par CRON_SECRET (Vercel Cron ou curl manuel).
 *
 * Schedule suggéré : 0 11 * * 1 (lundi 11h UTC ≈ 7h Toronto)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const autopilot = await syncAutopilotForAllLocations();
  const goals = await syncOperationalGoalsForAllLocations(now);

  return NextResponse.json({
    ok: true,
    locations: autopilot.locations,
    proposals: autopilot.proposals,
    goals,
  });
}

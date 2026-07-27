import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertLoadTestAccess } from "@/lib/load/guard";
import { submitPulseForUser } from "@/lib/pulse/core";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().uuid(),
  questionId: z.string().uuid(),
  locationId: z.string().uuid(),
  stationId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
});

/**
 * Harness k6 — soumission Pulse + idempotence PulseReceipt.
 * 200 = créé · 409 = already_submitted (idempotence honorée).
 */
export async function POST(request: NextRequest) {
  const denied = assertLoadTestAccess(request);
  if (denied) return denied;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: body.userId },
    select: { id: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const started = Date.now();
  const result = await submitPulseForUser(user.id, user.role, {
    questionId: body.questionId,
    locationId: body.locationId,
    stationId: body.stationId,
    score: body.score,
  });
  const durationMs = Date.now() - started;

  if (!result.ok) {
    if (result.error === "already_submitted") {
      return NextResponse.json({ ...result, durationMs }, { status: 409 });
    }
    const status = result.error === "unauthorized" ? 403 : 422;
    return NextResponse.json({ ...result, durationMs }, { status });
  }

  return NextResponse.json({ ok: true, durationMs }, { status: 200 });
}

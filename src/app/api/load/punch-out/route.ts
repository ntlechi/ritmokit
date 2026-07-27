import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertLoadTestAccess } from "@/lib/load/guard";
import { clockOutForUser } from "@/lib/punch/core";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().uuid(),
  shiftId: z.string().uuid(),
});

/**
 * Harness k6 — clock-out concurrent (fin de shift).
 * Guard: ALLOW_LOAD_TEST=1 + Bearer LOAD_TEST_SECRET.
 * Réutilise clockOutForUser (même chemin CNESST que la pointeuse).
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
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const started = Date.now();
  const result = await clockOutForUser(body.userId, body.shiftId);
  const durationMs = Date.now() - started;

  if (!result.ok) {
    const status =
      result.error === "already_clocked_out" || result.error === "not_clocked_in"
        ? 409
        : result.error === "unauthorized" || result.error === "shift_not_found"
          ? 404
          : 422;
    return NextResponse.json({ ...result, durationMs }, { status });
  }

  return NextResponse.json({ ok: true, durationMs }, { status: 200 });
}

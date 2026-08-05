import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { cancelInteracEnrollment, cancelInteracSchema } from "@/lib/payments/interac";

export const runtime = "nodejs";

/** POST /api/studio/payments/interac/{enrollmentId}/cancel */
export async function POST(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const parsed = cancelInteracSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { enrollmentId } = await context.params;
  const result = await cancelInteracEnrollment({
    userId: user.id,
    role: user.role,
    enrollmentId,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    enrollmentId: result.enrollmentId,
    paymentStatus: result.paymentStatus,
    promoted: result.promoted,
  });
}

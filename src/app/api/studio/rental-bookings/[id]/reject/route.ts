import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { rejectRentalBooking } from "@/lib/rentals/studio";

export const runtime = "nodejs";

/** POST /api/studio/rental-bookings/{id}/reject */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let reason: string | undefined;
  try {
    const body = (await request.json()) as { reason?: string };
    reason = body.reason;
  } catch {
    // optional body
  }

  const { id } = await context.params;
  const result = await rejectRentalBooking({
    userId: user.id,
    role: user.role,
    bookingId: id,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, booking: result.booking });
}

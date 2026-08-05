import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { approveRentalBooking } from "@/lib/rentals/studio";

export const runtime = "nodejs";

/** POST /api/studio/rental-bookings/{id}/approve */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const result = await approveRentalBooking({
    userId: user.id,
    role: user.role,
    bookingId: id,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, booking: result.booking });
}

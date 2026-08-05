import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listPendingB2bBookings } from "@/lib/rentals/studio";

export const runtime = "nodejs";

/** GET /api/studio/rental-bookings/pending — B2B approval queue (FIFO) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await listPendingB2bBookings(user.id, user.role);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, bookings: result.bookings });
}

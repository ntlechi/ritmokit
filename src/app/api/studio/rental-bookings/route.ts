import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  createStaffRentalBooking,
  listStudioRentalBookings,
  staffRentalBookingSchema,
} from "@/lib/rentals/studio";

export const runtime = "nodejs";

/** GET /api/studio/rental-bookings */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const result = await listStudioRentalBookings({
    userId: user.id,
    role: user.role,
    status: sp.get("status"),
    from: sp.get("from"),
    to: sp.get("to"),
    roomId: sp.get("roomId"),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, bookings: result.bookings });
}

/** POST /api/studio/rental-bookings — staff / internal booking */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = staffRentalBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await createStaffRentalBooking({
    userId: user.id,
    role: user.role,
    payload: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, booking: result.booking }, { status: 201 });
}

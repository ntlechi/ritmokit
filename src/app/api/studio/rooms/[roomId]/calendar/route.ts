import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getStudioRoomCalendar } from "@/lib/rentals/studio";

export const runtime = "nodejs";

/** GET /api/studio/rooms/{roomId}/calendar?date=YYYY-MM-DD */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { roomId } = await context.params;
  const date = request.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const result = await getStudioRoomCalendar({
    userId: user.id,
    role: user.role,
    roomId,
    date,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    room: result.room,
    date: result.date,
    timeline: result.timeline,
    bookings: result.bookings,
  });
}

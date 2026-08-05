import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { lookupEnrollmentByTicket } from "@/lib/payments/interac";

export const runtime = "nodejs";

/** GET /api/studio/enrollments/lookup?ticket=RK|… */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ticket = request.nextUrl.searchParams.get("ticket");
  if (!ticket?.trim()) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const result = await lookupEnrollmentByTicket({
    userId: user.id,
    role: user.role,
    ticket,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, enrollment: result.enrollment });
}

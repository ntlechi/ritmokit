import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listPendingInteracEnrollments } from "@/lib/payments/interac";
import { listInteracPending } from "@/lib/rentals/studio";

export const runtime = "nodejs";

/**
 * GET /api/studio/payments/interac/pending
 * Query: kind=enrollment|rental|all (default enrollment for Studio queue),
 *        limit, locationId (ignored — scoped to primary membership).
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const kindRaw = sp.get("kind") ?? "enrollment";
  const kind =
    kindRaw === "rental" || kindRaw === "enrollment" || kindRaw === "all" ? kindRaw : "enrollment";
  const limit = Number(sp.get("limit") ?? 50);

  if (kind === "rental" || kind === "all") {
    const rentals = await listInteracPending({
      userId: user.id,
      role: user.role,
      kind,
    });
    if (!rentals.ok) {
      return NextResponse.json({ error: rentals.error }, { status: rentals.status });
    }

    if (kind === "rental") {
      const totalAmountCents = rentals.items.reduce((s, i) => s + i.amountCents, 0);
      return NextResponse.json({
        ok: true,
        items: rentals.items,
        summary: { count: rentals.items.length, totalAmountCents },
      });
    }

    const enrollments = await listPendingInteracEnrollments({
      userId: user.id,
      role: user.role,
      limit,
    });
    if (!enrollments.ok) {
      return NextResponse.json({ error: enrollments.error }, { status: enrollments.status });
    }

    return NextResponse.json({
      ok: true,
      items: [
        ...enrollments.items.map((i) => ({ kind: "enrollment" as const, ...i })),
        ...rentals.items,
      ],
      summary: {
        count: enrollments.summary.count + rentals.items.length,
        totalAmountCents:
          enrollments.summary.totalAmountCents +
          rentals.items.reduce((s, i) => s + i.amountCents, 0),
      },
    });
  }

  const result = await listPendingInteracEnrollments({
    userId: user.id,
    role: user.role,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    items: result.items,
    summary: result.summary,
  });
}

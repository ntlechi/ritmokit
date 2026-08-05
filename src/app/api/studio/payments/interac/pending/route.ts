import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listInteracPending } from "@/lib/rentals/studio";

export const runtime = "nodejs";

/** GET /api/studio/payments/interac/pending?kind=rental|enrollment|all */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const kindRaw = request.nextUrl.searchParams.get("kind") ?? "all";
  const kind =
    kindRaw === "rental" || kindRaw === "enrollment" || kindRaw === "all" ? kindRaw : "all";

  const result = await listInteracPending({
    userId: user.id,
    role: user.role,
    kind,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, items: result.items });
}

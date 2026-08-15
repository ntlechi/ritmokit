import { NextResponse, type NextRequest } from "next/server";
import {
  listStudioEnrollments,
  resolveStudioLocationId,
  updateStudioEnrollmentAttendance,
} from "@/lib/data/studio-enrollments";
import { authorizeStudioRoster } from "@/lib/studio-api/authorize";

export const runtime = "nodejs";

/**
 * GET /api/studio/enrollments
 * Query: locationId | locationSlug + organizationSlug, seasonId, sessionId, paid, waitlisted, q, limit
 *
 * Auth: Supabase session (Accueil+) OR Authorization: Bearer RITMOKIT_STUDIO_ROSTER_SECRET
 * (Bearer requires explicit locationId or locationSlug).
 */
export async function GET(request: NextRequest) {
  const auth = await authorizeStudioRoster(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const location = await resolveStudioLocationId({
    userId: auth.mode === "session" ? auth.userId : null,
    role: auth.mode === "session" ? auth.role : null,
    locationId: sp.get("locationId"),
    locationSlug: sp.get("locationSlug"),
    organizationSlug: sp.get("organizationSlug"),
    requireExplicitLocation: auth.mode === "roster_secret",
  });
  if (!location.ok) {
    return NextResponse.json({ error: location.error }, { status: location.status });
  }

  const paidRaw = sp.get("paid");
  const waitRaw = sp.get("waitlisted");
  const paid =
    paidRaw === "true" || paidRaw === "1" ? true : paidRaw === "false" || paidRaw === "0" ? false : null;
  const waitlisted =
    waitRaw === "true" || waitRaw === "1" ? true : waitRaw === "false" || waitRaw === "0" ? false : null;

  const result = await listStudioEnrollments({
    locationId: location.locationId,
    seasonId: sp.get("seasonId"),
    sessionId: sp.get("sessionId"),
    paid,
    waitlisted,
    q: sp.get("q"),
    limit: Number(sp.get("limit") ?? 500),
  });

  return NextResponse.json({
    ok: true,
    locationId: result.locationId,
    count: result.count,
    items: result.items,
  });
}

/**
 * PATCH /api/studio/enrollments
 * Body: { enrollmentId, attended: true | false | null }
 */
export async function PATCH(request: NextRequest) {
  const auth = await authorizeStudioRoster(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    enrollmentId?: string;
    attended?: boolean | null;
    locationId?: string;
    locationSlug?: string;
    organizationSlug?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.enrollmentId || !/^[0-9a-f-]{36}$/i.test(body.enrollmentId)) {
    return NextResponse.json({ error: "invalid_enrollment_id" }, { status: 400 });
  }
  if (body.attended !== true && body.attended !== false && body.attended !== null) {
    return NextResponse.json({ error: "invalid_attended" }, { status: 400 });
  }

  const location = await resolveStudioLocationId({
    userId: auth.mode === "session" ? auth.userId : null,
    role: auth.mode === "session" ? auth.role : null,
    locationId: body.locationId ?? request.nextUrl.searchParams.get("locationId"),
    locationSlug: body.locationSlug ?? request.nextUrl.searchParams.get("locationSlug"),
    organizationSlug:
      body.organizationSlug ?? request.nextUrl.searchParams.get("organizationSlug"),
    requireExplicitLocation: auth.mode === "roster_secret",
  });
  if (!location.ok) {
    return NextResponse.json({ error: location.error }, { status: location.status });
  }

  const result = await updateStudioEnrollmentAttendance({
    locationId: location.locationId,
    enrollmentId: body.enrollmentId,
    attended: body.attended,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, enrollmentId: body.enrollmentId, attended: body.attended });
}

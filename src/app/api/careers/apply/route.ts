import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  arsimatrixTriageReportSchema,
  jobApplySchema,
} from "@/lib/careers/schemas";
import {
  pushApplicationsToArsimatrix,
  toMirokWire,
} from "@/lib/arsimatrix/bridge";

export const runtime = "nodejs";

/**
 * Public careers intake — Bati Cantine candidates.
 * Persists JobApplication then pushes to Arsimatrix bati-recruit.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = jobApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const location = await prisma.location.findUnique({
    where: { id: input.locationId },
  });
  if (!location || !location.isActive) {
    return NextResponse.json({ error: "location_not_found" }, { status: 404 });
  }

  const app = await prisma.jobApplication.create({
    data: {
      locationId: input.locationId,
      fullName: input.fullName,
      email: input.email || null,
      phone: input.phone ?? null,
      neighborhood: input.neighborhood,
      availableShifts: input.availableShifts,
      commuteMinutes: input.commuteMinutes,
      yearsExperience: input.yearsExperience,
      hasFoodPermit: input.hasFoodPermit,
      speaksFrench: input.speaksFrench,
      notes: input.notes ?? null,
      status: "PENDING",
    },
  });

  if (input.dryRun) {
    return NextResponse.json({
      ok: true,
      applicationId: app.id,
      pushed: false,
      dryRun: true,
    });
  }

  await prisma.jobApplication.update({
    where: { id: app.id },
    data: { status: "TRIAGING" },
  });

  const wire = toMirokWire(app, location);
  const push = await pushApplicationsToArsimatrix([wire], {
    site: wire.site,
    requiredShifts: ["soir"],
  });

  if (!push.ok) {
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: { status: "PENDING" },
    });
    return NextResponse.json(
      {
        ok: false,
        applicationId: app.id,
        stored: true,
        pushed: false,
        error: push.error,
        hint: "Candidature sauvegardée. Démarre Arsimatrix (npm run dev :3100) puis re-sync.",
      },
      { status: 502 },
    );
  }

  const reportParsed = arsimatrixTriageReportSchema.safeParse(push.data);
  if (!reportParsed.success) {
    console.error("[mirok:careers:apply] invalid arsimatrix report", reportParsed.error.issues);
    return NextResponse.json({
      ok: true,
      applicationId: app.id,
      pushed: true,
      triaged: false,
      warning: "arsimatrix_report_unvalidated",
      arsimatrix: push.data,
    });
  }

  const report = reportParsed.data.report;
  const traceId = report?.context?.traceId;
  if (traceId) {
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: { arsimatrixTraceId: traceId },
    });
  }

  const payload = report?.payload;
  const shortlisted = payload?.shortlisted ?? [];
  const rejected = payload?.rejected ?? [];
  const shortHit = shortlisted.find((s) => s.candidateId === app.id);
  const rejectHit = rejected.find((r) => r.candidateId === app.id);
  const hit = shortHit ?? rejectHit;
  if (hit) {
    await prisma.jobApplication.update({
      where: { id: app.id },
      data: {
        status: shortHit ? "SHORTLISTED" : "REJECTED",
        triageScore: shortHit?.score ?? null,
        triageReasons: hit.reasons ?? [],
        triageSummary:
          payload?.summary != null ? String(payload.summary) : null,
        triagedAt: new Date(),
        arsimatrixTraceId: traceId ?? undefined,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    applicationId: app.id,
    pushed: true,
    triaged: Boolean(hit),
    arsimatrix: push.data,
  });
}

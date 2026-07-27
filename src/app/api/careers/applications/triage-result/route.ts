import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCareersRequest } from "@/lib/careers/authorize";
import { triageResultSchema } from "@/lib/careers/schemas";

export const runtime = "nodejs";

/**
 * Callback from Arsimatrix after bati-recruit REPORT.
 * Updates JobApplication rows with shortlist / reject outcomes.
 */
export async function POST(request: NextRequest) {
  if (!authorizeCareersRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = triageResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { shortlisted, rejected, summary, traceId } = parsed.data;
  const shortMap = new Map(shortlisted.map((s) => [s.candidateId, s]));
  const rejectMap = new Map(rejected.map((r) => [r.candidateId, r]));
  const ids = [
    ...new Set([
      ...parsed.data.applicationIds,
      ...shortMap.keys(),
      ...rejectMap.keys(),
    ]),
  ];

  let updated = 0;
  for (const id of ids) {
    const short = shortMap.get(id);
    const rej = rejectMap.get(id);
    if (!short && !rej) continue;

    await prisma.jobApplication.updateMany({
      where: { id },
      data: {
        status: short ? "SHORTLISTED" : "REJECTED",
        triageScore: short?.score ?? null,
        triageReasons: short?.reasons ?? rej?.reasons ?? [],
        triageSummary: summary ?? null,
        triagedAt: new Date(),
        arsimatrixTraceId: traceId ?? undefined,
      },
    });
    updated += 1;
  }

  return NextResponse.json({ ok: true, updated });
}

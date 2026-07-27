import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  pushApplicationsToArsimatrix,
  toMirokWire,
} from "@/lib/arsimatrix/bridge";
import { authorizeCareersRequest } from "@/lib/careers/authorize";

export const runtime = "nodejs";

/**
 * Re-push PENDING applications to Arsimatrix (batch).
 * Use after Arsimatrix comes back online.
 */
export async function POST(request: NextRequest) {
  if (!authorizeCareersRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);

  const rows = await prisma.jobApplication.findMany({
    where: {
      status: { in: ["PENDING", "TRIAGING"] },
      ...(locationId ? { locationId } : {}),
    },
    include: { location: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  if (!rows.length) {
    return NextResponse.json({ ok: true, pushed: 0, message: "nothing_pending" });
  }

  await prisma.jobApplication.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: "TRIAGING" },
  });

  const wires = rows.map((r) => toMirokWire(r, r.location));
  const push = await pushApplicationsToArsimatrix(wires, {
    site: wires[0]?.site,
    requiredShifts: ["soir"],
  });

  if (!push.ok) {
    await prisma.jobApplication.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: "PENDING" },
    });
    return NextResponse.json(
      { ok: false, error: push.error, count: rows.length },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    pushed: rows.length,
    applicationIds: rows.map((r) => r.id),
    arsimatrix: push.data,
  });
}

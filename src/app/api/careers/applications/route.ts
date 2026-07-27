import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCareersRequest } from "@/lib/careers/authorize";
import { toMirokWire } from "@/lib/arsimatrix/bridge";
import type { JobApplicationStatus } from "@/generated/prisma/client";

export const runtime = "nodejs";

/**
 * List applications for Arsimatrix pull-sync / manager tooling.
 * GET /api/careers/applications?status=PENDING&locationId=…
 */
export async function GET(request: NextRequest) {
  if (!authorizeCareersRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "PENDING") as JobApplicationStatus;
  const locationId = url.searchParams.get("locationId") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const rows = await prisma.jobApplication.findMany({
    where: {
      status,
      ...(locationId ? { locationId } : {}),
    },
    include: { location: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return NextResponse.json({
    ok: true,
    count: rows.length,
    applications: rows.map((r) => toMirokWire(r, r.location)),
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertLoadTestAccess } from "@/lib/load/guard";
import { prisma } from "@/lib/prisma";
import { getPulseWeekParts } from "@/lib/pulse/week";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Optional: filter to a single location. */
  locationId: z.string().uuid().optional(),
  /** How many open clocked-in shifts to prepare (default 40). */
  count: z.number().int().min(1).max(100).optional(),
});

/**
 * Prépare des quarts « clocked-in » pour le burst k6.
 * Remet actualEndsAt à null et actualStartsAt à now-6h pour chaque shift cible.
 * Staging uniquement (ALLOW_LOAD_TEST=1).
 */
export async function POST(request: NextRequest) {
  const denied = assertLoadTestAccess(request);
  if (denied) return denied;

  let body: z.infer<typeof bodySchema> = {};
  try {
    const json = await request.json().catch(() => ({}));
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const count = body.count ?? 40;
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId: { not: null },
      status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
      ...(body.locationId ? { locationId: body.locationId } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      locationId: true,
      stationId: true,
      location: { select: { organizationId: true } },
    },
    take: count,
    orderBy: { startsAt: "desc" },
  });

  if (shifts.length === 0) {
    return NextResponse.json({ ok: false, error: "no_shifts" }, { status: 404 });
  }

  await prisma.$transaction(
    shifts.map((s) =>
      prisma.shift.update({
        where: { id: s.id },
        data: {
          actualStartsAt: sixHoursAgo,
          actualEndsAt: null,
          breakStartedAt: null,
          breakEndedAt: null,
        },
      }),
    ),
  );

  const { weekNumber, year } = getPulseWeekParts();
  const userIds = [...new Set(shifts.map((s) => s.employeeId!).filter(Boolean))];
  await prisma.pulseReceipt.deleteMany({
    where: { userId: { in: userIds }, year, weekNumber },
  });

  const orgId = shifts[0].location.organizationId;
  let question = await prisma.pulseQuestion.findUnique({
    where: {
      organizationId_weekNumber_year: {
        organizationId: orgId,
        weekNumber,
        year,
      },
    },
    select: { id: true },
  });

  if (!question) {
    question = await prisma.pulseQuestion.create({
      data: {
        organizationId: orgId,
        weekNumber,
        year,
        isActive: true,
        textFr: "Charge test — moral de fin de shift ?",
        textEn: "Load test — end-of-shift morale?",
        textEs: "Prueba de carga — ¿moral de fin de turno?",
        valueKey: "EQUIPE_DABORD",
      },
      select: { id: true },
    });
  }

  const fixtures = shifts.map((s) => ({
    shiftId: s.id,
    userId: s.employeeId!,
    locationId: s.locationId,
    stationId: s.stationId,
    questionId: question!.id,
  }));

  return NextResponse.json({
    ok: true,
    count: fixtures.length,
    weekNumber,
    year,
    fixtures,
  });
}

/**
 * One-off: seed the Nouveaux inbox from enrollments made before StudentIntake existed.
 *
 *   npx tsx scripts/backfill-intake.ts            # dry run, prints the plan
 *   npx tsx scripts/backfill-intake.ts --apply    # writes rows
 *
 * One row per (student, location). Pairs that already have an intake are left alone,
 * so re-running is safe.
 */
import "dotenv/config";
import type { IntakeSource, IntakeStatus } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";

const apply = process.argv.includes("--apply");

type Pair = {
  studentId: string;
  locationId: string;
  enrollments: {
    sessionId: string;
    createdAt: Date;
    attended: boolean;
    paymentProvider: string | null;
    firstMark: Date | null;
    marks: number;
  }[];
};

function planStatus(pair: Pair): { status: IntakeStatus; firstAttendedAt: Date | null } {
  const attendedAt = pair.enrollments
    .map((e) => e.firstMark ?? (e.attended ? e.createdAt : null))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const firstAttendedAt = attendedAt[0] ?? null;
  const nightsAttended = pair.enrollments.reduce((n, e) => n + Math.max(e.marks, e.attended ? 1 : 0), 0);

  if (pair.enrollments.length > 1 || nightsAttended > 1) return { status: "ACTIVE", firstAttendedAt };
  if (firstAttendedAt) return { status: "ATTENDED", firstAttendedAt };
  return { status: "NEW", firstAttendedAt: null };
}

async function main() {
  const [enrollments, existing] = await Promise.all([
    prisma.enrollment.findMany({
      where: { paymentStatus: { not: "CANCELLED_INTERAC" } },
      orderBy: { createdAt: "asc" },
      select: {
        studentId: true,
        sessionId: true,
        createdAt: true,
        attended: true,
        paymentProvider: true,
        session: {
          select: {
            season: { select: { locationId: true } },
            room: { select: { locationId: true } },
          },
        },
        attendanceMarks: {
          where: { attended: true },
          orderBy: { occurredOn: "asc" },
          select: { occurredOn: true },
        },
      },
    }),
    prisma.studentIntake.findMany({ select: { studentId: true, locationId: true } }),
  ]);

  const done = new Set(existing.map((r) => `${r.studentId}:${r.locationId}`));
  const pairs = new Map<string, Pair>();
  for (const e of enrollments) {
    const locationId = e.session.season?.locationId ?? e.session.room.locationId;
    const key = `${e.studentId}:${locationId}`;
    if (done.has(key)) continue;
    let pair = pairs.get(key);
    if (!pair) {
      pair = { studentId: e.studentId, locationId, enrollments: [] };
      pairs.set(key, pair);
    }
    pair.enrollments.push({
      sessionId: e.sessionId,
      createdAt: e.createdAt,
      attended: e.attended,
      paymentProvider: e.paymentProvider,
      firstMark: e.attendanceMarks[0]?.occurredOn ?? null,
      marks: e.attendanceMarks.length,
    });
  }

  const rows = [...pairs.values()].map((pair) => {
    const first = pair.enrollments[0];
    const { status, firstAttendedAt } = planStatus(pair);
    const source: IntakeSource = first.paymentProvider === "CASH" ? "DOOR" : "WEBSITE";
    return {
      studentId: pair.studentId,
      locationId: pair.locationId,
      status,
      source,
      firstSessionId: first.sessionId,
      firstAttendedAt,
      createdAt: first.createdAt,
    };
  });

  const tally = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Already tracked: ${done.size}. To create: ${rows.length}`, tally);

  if (!apply) {
    console.log("Dry run — re-run with --apply to write.");
    return;
  }
  const { count } = await prisma.studentIntake.createMany({ data: rows, skipDuplicates: true });
  console.log(`Created ${count} intake rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

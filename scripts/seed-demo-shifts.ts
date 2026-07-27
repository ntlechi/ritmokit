/**
 * Sème des quarts à venir pour Sam Employé afin de visualiser la vue
 * « Mes quarts » (héros + regroupement par jour).
 * Usage : npx tsx scripts/seed-demo-shifts.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const LOCATION_ID = "00000000-0000-0000-0000-000000000011";
const SAM_ID = "00000000-0000-0000-0000-000000000002";
const MANAGER_ID = "00000000-0000-0000-0000-000000000001";

const LEGACY_STATION_SLUG = {
  CUISINE: "cuisine",
  COMPTOIR: "services",
  EMBALLAGE: "emballage",
} as const;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function atDate(base: Date, dayOffset: number, hour: number, minute = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const stations = await prisma.station.findMany({
    where: { locationId: LOCATION_ID },
    select: { id: true, slug: true },
  });
  const stationIdBySlug = Object.fromEntries(
    stations.filter((s) => s.slug).map((s) => [s.slug!, s.id]),
  );

  const lastShift = await prisma.shift.findFirst({
    where: { employeeId: SAM_ID, status: { not: "REJECTED" } },
    orderBy: { endsAt: "desc" },
    select: { endsAt: true },
  });
  const base = new Date(
    Math.max(Date.now(), lastShift ? lastShift.endsAt.getTime() + 33 * 3600_000 : 0),
  );

  const shifts = [
    { station: "CUISINE" as const, period: "DAY" as const, startsAt: atDate(base, 1, 11), endsAt: atDate(base, 1, 17), status: "PUBLISHED" as const, breakMinutes: 30 },
    { station: "COMPTOIR" as const, period: "NIGHT" as const, startsAt: atDate(base, 3, 17), endsAt: atDate(base, 3, 23), status: "CONFIRMED" as const, breakMinutes: 30 },
    { station: "EMBALLAGE" as const, period: "DAY" as const, startsAt: atDate(base, 5, 9), endsAt: atDate(base, 5, 15), status: "PENDING_CONFIRMATION" as const, breakMinutes: 30 },
    { station: "CUISINE" as const, period: "DAY" as const, startsAt: atDate(base, 7, 11), endsAt: atDate(base, 7, 17), status: "PUBLISHED" as const, breakMinutes: 30 },
  ];

  for (const s of shifts) {
    const stationId = stationIdBySlug[LEGACY_STATION_SLUG[s.station]];
    if (!stationId) throw new Error(`station_not_found:${s.station}`);
    await prisma.shift.create({
      data: {
        locationId: LOCATION_ID,
        employeeId: SAM_ID,
        createdById: MANAGER_ID,
        stationId,
        period: s.period,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        breakMinutes: s.breakMinutes,
        breakRequiredMinutes: 30,
        publishedAt: new Date(),
      },
    });
  }
  console.log(`✓ ${shifts.length} quarts à venir créés pour Sam`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

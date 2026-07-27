/**
 * Prépare la DB pour le test « Jour 1 » : quart actif pour Sam, géofence large, vote pourboires réinitialisé.
 * Usage : npx tsx scripts/validation-day1-prep.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SAM_ID = "00000000-0000-0000-0000-000000000002";
const MANAGER_ID = "00000000-0000-0000-0000-000000000001";
const LOCATION_ID = "00000000-0000-0000-0000-000000000011";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cuisineStation = await prisma.station.findFirst({
    where: { locationId: LOCATION_ID, slug: "cuisine" },
    select: { id: true },
  });
  if (!cuisineStation) throw new Error("cuisine_station_not_found");

  const now = new Date();
  const startsAt = new Date(now.getTime() - 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  await prisma.location.update({
    where: { id: LOCATION_ID },
    data: { geofenceRadiusMeters: 9_999_999 },
  });

  await prisma.shift.deleteMany({
    where: { locationId: LOCATION_ID, employeeId: SAM_ID },
  });

  const shift = await prisma.shift.create({
    data: {
      locationId: LOCATION_ID,
      stationId: cuisineStation.id,
      period: "DAY",
      employeeId: SAM_ID,
      createdById: MANAGER_ID,
      startsAt,
      endsAt,
      breakMinutes: 30,
      breakRequiredMinutes: 30,
      status: "PUBLISHED",
    },
  });

  const config = await prisma.tipPoolConfig.findUnique({ where: { locationId: LOCATION_ID } });
  if (config) {
    await prisma.tipPoolVote.deleteMany({ where: { configId: config.id } });
    await prisma.tipPoolConfig.update({
      where: { id: config.id },
      data: {
        status: "APPROVED",
        isActive: true,
        votedAt: new Date("2026-05-12T16:00:00.000Z"),
      },
    });
  }

  console.log("✓ geofenceRadiusMeters → 9_999_999");
  console.log(`✓ shift ${shift.id} for Sam (${startsAt.toISOString()} → ${endsAt.toISOString()})`);
  console.log("✓ tip votes cleared (manager can start a new vote)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

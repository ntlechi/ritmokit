/**
 * Convert a location's legacy stations into dance-studio rooms + departments.
 *
 * Rooms:       Studio A/B/C + Hall d'accueil (bookable by ClassSession)
 * Departments: Instructeurs, Accueil, Direction, Entretien (roster grouping)
 *
 * Re-runnable. Existing team members, shifts and class sessions are remapped
 * off legacy station rows before those rows are deactivated.
 *
 * Usage:
 *   npx tsx scripts/seed-dance-stations.ts             # every location
 *   npx tsx scripts/seed-dance-stations.ts <locationId>
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  DANCE_STATIONS,
  LEGACY_STATION_SLUGS,
  LEGACY_STATION_TO_DEPARTMENT,
} from "../src/lib/stations/dance-defaults";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const LEADERSHIP_ROLES = new Set(["OWNER", "MANAGER", "ADMIN"]);

async function seedLocation(locationId: string, locationName: string) {
  const bySlug = new Map<string, string>();

  for (const def of DANCE_STATIONS) {
    const row = await prisma.station.upsert({
      where: { locationId_nameFr: { locationId, nameFr: def.nameFr } },
      update: {
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        slug: def.slug,
        kind: def.kind,
        sortOrder: def.sortOrder,
        isActive: true,
        ...(def.capacity != null ? { capacity: def.capacity } : {}),
        ...(def.surfaceSqm != null ? { surfaceSqm: def.surfaceSqm } : {}),
      },
      create: {
        locationId,
        slug: def.slug,
        kind: def.kind,
        nameFr: def.nameFr,
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        sortOrder: def.sortOrder,
        capacity: def.capacity ?? null,
        surfaceSqm: def.surfaceSqm ?? null,
      },
    });
    bySlug.set(def.slug, row.id);
  }

  const defaultRoomId = bySlug.get("studio-a")!;

  const legacy = await prisma.station.findMany({
    where: { locationId, slug: { in: LEGACY_STATION_SLUGS } },
    select: { id: true, slug: true, nameFr: true },
  });

  let movedMembers = 0;
  let movedClasses = 0;

  for (const old of legacy) {
    const targetSlug = old.slug ? LEGACY_STATION_TO_DEPARTMENT[old.slug] : undefined;
    const departmentId = targetSlug ? bySlug.get(targetSlug) : undefined;
    if (!departmentId || departmentId === old.id) continue;

    // Classes booked into a legacy station move to the main room, not a department.
    const classes = await prisma.classSession.updateMany({
      where: { roomId: old.id },
      data: { roomId: defaultRoomId },
    });
    movedClasses += classes.count;

    // Owners/managers belong to Direction whatever legacy station they sat on.
    const directionId = bySlug.get("direction")!;
    const legacyMembers = await prisma.locationMember.findMany({
      where: { stationId: old.id },
      select: { id: true, user: { select: { role: true } } },
    });
    for (const member of legacyMembers) {
      const isLeadership = LEADERSHIP_ROLES.has(member.user.role);
      await prisma.locationMember.update({
        where: { id: member.id },
        data: { stationId: isLeadership ? directionId : departmentId },
      });
      movedMembers += 1;
    }

    await prisma.shift.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.formationModule.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.formationAssignment.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.employeeStationSkill.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.chatChannel.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.stationShoutOut.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.pulseResponse.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.sop.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.document.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.scheduleTemplateShift.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });
    await prisma.payrollLineItem.updateMany({ where: { stationId: old.id }, data: { stationId: departmentId } });

    await prisma.station.update({
      where: { id: old.id },
      data: { isActive: false, slug: null },
    });
  }

  // Any member still parked on a room lands in the right department by role.
  const roomIds = DANCE_STATIONS.filter((s) => s.kind === "ROOM")
    .map((s) => bySlug.get(s.slug)!)
    .filter(Boolean);

  const strandedMembers = await prisma.locationMember.findMany({
    where: { locationId, stationId: { in: roomIds } },
    select: { id: true, user: { select: { role: true } } },
  });

  for (const member of strandedMembers) {
    const role = member.user.role;
    const slug = LEADERSHIP_ROLES.has(role)
      ? "direction"
      : role === "FRONT_DESK"
        ? "accueil"
        : "instructeurs";
    await prisma.locationMember.update({
      where: { id: member.id },
      data: { stationId: bySlug.get(slug)! },
    });
    movedMembers += 1;
  }

  console.log(
    `✓ ${locationName}: ${DANCE_STATIONS.length} stations (4 rooms, 4 departments) · ` +
      `${movedMembers} member(s) remapped · ${movedClasses} class(es) rehoused · ` +
      `${legacy.length} legacy station(s) retired`,
  );
}

async function main() {
  const target = process.argv[2];
  const locations = await prisma.location.findMany({
    where: target ? { id: target } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (locations.length === 0) {
    console.error(target ? `No location with id ${target}` : "No locations found.");
    process.exit(1);
  }

  for (const location of locations) {
    await seedLocation(location.id, location.name);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

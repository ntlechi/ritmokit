/**
 * Reconfigure Bati Québec avec les 5 postes dynamiques (Entretiens, Cuisine,
 * Services, Gérants Jour/Soir) et remappe les données legacy enum → nouveaux IDs.
 * Usage : npx tsx scripts/seed-bati-stations.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const LOCATION_ID = "00000000-0000-0000-0000-000000000011";

const BATI_STATIONS = [
  { slug: "entretiens", nameFr: "Entretiens", nameEn: "Maintenance", nameEs: "Mantenimiento", colorHex: "#6B7280", tipPoints: 0.8, sortOrder: 1 },
  { slug: "cuisine", nameFr: "Cuisine", nameEn: "Kitchen", nameEs: "Cocina", colorHex: "#EF4444", tipPoints: 0.8, sortOrder: 2 },
  { slug: "services", nameFr: "Services", nameEn: "Services", nameEs: "Servicios", colorHex: "#10B981", tipPoints: 1.2, sortOrder: 3 },
  { slug: "gerants-jour", nameFr: "Gérants (Jour)", nameEn: "Managers (Day)", nameEs: "Gerentes (Día)", colorHex: "#3B82F6", tipPoints: 1.0, sortOrder: 4 },
  { slug: "gerants-soir", nameFr: "Gérants (Soir)", nameEn: "Managers (Night)", nameEs: "Gerentes (Noche)", colorHex: "#1E3A8A", tipPoints: 1.0, sortOrder: 5 },
] as const;

/** Ancien slug legacy (migration) → nouveau slug Bati */
const LEGACY_REMAP: Record<string, string> = {
  cuisine: "cuisine",
  comptoir: "services",
  emballage: "entretiens",
};

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const stationIds = new Map<string, string>();

  for (const def of BATI_STATIONS) {
    const row = await prisma.station.upsert({
      where: { locationId_nameFr: { locationId: LOCATION_ID, nameFr: def.nameFr } },
      update: {
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        slug: def.slug,
        sortOrder: def.sortOrder,
        tipPoints: def.tipPoints,
        isActive: true,
      },
      create: {
        locationId: LOCATION_ID,
        ...def,
      },
    });
    stationIds.set(def.slug, row.id);
  }

  // Désactiver les postes legacy restants (Comptoir, Emballage génériques)
  await prisma.station.updateMany({
    where: {
      locationId: LOCATION_ID,
      slug: { in: ["comptoir", "emballage"] },
      nameFr: { in: ["Comptoir", "Emballage"] },
    },
    data: { isActive: false },
  });

  const legacy = await prisma.station.findMany({
    where: { locationId: LOCATION_ID, slug: { in: ["cuisine", "comptoir", "emballage"] } },
  });

  for (const old of legacy) {
    const targetSlug = old.slug ? LEGACY_REMAP[old.slug] : null;
    const newId = targetSlug ? stationIds.get(targetSlug) : null;
    if (!newId || newId === old.id) continue;

    await prisma.locationMember.updateMany({ where: { stationId: old.id }, data: { stationId: newId } });
    await prisma.shift.updateMany({ where: { stationId: old.id }, data: { stationId: newId } });
    await prisma.formationModule.updateMany({ where: { stationId: old.id }, data: { stationId: newId } });
    await prisma.staffingProfile.updateMany({ where: { stationId: old.id }, data: { stationId: newId } });
    await prisma.employeeStationSkill.updateMany({ where: { stationId: old.id }, data: { stationId: newId } });
    await prisma.chatChannel.updateMany({ where: { stationId: old.id }, data: { stationId: newId } });
  }

  console.log(`✓ ${BATI_STATIONS.length} postes Bati configurés pour la succursale ${LOCATION_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

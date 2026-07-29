/**
 * RitmoKit default database seed — dance studio demo tenant.
 *
 * Creates a demo org/location + staff users, then runs:
 *   seed-dance-stations → seed-dance-demo
 *
 * Legacy QSR kitchen seed: scripts/seed-legacy-qsr.ts
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DANCE_DEPARTMENTS } from "../src/lib/stations/dance-defaults";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000010";
const DEMO_LOCATION_ID = "00000000-0000-0000-0000-000000000011";

const STAFF_USERS = [
  { id: "00000000-0000-0000-0000-000000000010", email: "owner@ritmokit.com", fullName: "RitmoKit Owner", role: "OWNER" as const },
  { id: "00000000-0000-0000-0000-000000000001", email: "manager@ritmokit.com", fullName: "Studio Manager", role: "MANAGER" as const },
  { id: "00000000-0000-0000-0000-000000000004", email: "chloe@ritmokit.com", fullName: "Chloé Tremblay", role: "INSTRUCTOR" as const },
  { id: "00000000-0000-0000-0000-000000000005", email: "max@ritmokit.com", fullName: "Maxime Bouchard", role: "INSTRUCTOR" as const },
  { id: "00000000-0000-0000-0000-000000000002", email: "employe@ritmokit.com", fullName: "Samuel Gagnon", role: "INSTRUCTOR" as const },
  { id: "00000000-0000-0000-0000-000000000006", email: "nina@ritmokit.com", fullName: "Nina Rodriguez", role: "INSTRUCTOR" as const },
  { id: "00000000-0000-0000-0000-000000000007", email: "theo@ritmokit.com", fullName: "Théo Lavoie", role: "INSTRUCTOR" as const },
  { id: "00000000-0000-0000-0000-000000000008", email: "jade@ritmokit.com", fullName: "Jade Pelletier", role: "FRONT_DESK" as const },
  { id: "00000000-0000-0000-0000-000000000009", email: "sofia@ritmokit.com", fullName: "Sofia Moreno", role: "FRONT_DESK" as const },
  { id: "00000000-0000-0000-0000-000000000003", email: "soir@ritmokit.com", fullName: "Léa Fortin", role: "EMPLOYEE" as const },
] as const;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function runScript(relativePath: string, ...args: string[]) {
  const result = spawnSync("npx", ["tsx", relativePath, ...args], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function bootstrapTenant() {
  const org = await prisma.organization.upsert({
    where: { slug: "ritmokit-demo" },
    update: {
      name: "RitmoKit Demo Studio",
      primaryColor: "#E11D48",
      welcomeCopy:
        "Bienvenue dans RitmoKit — sessions, Accueil, salles et équipe dans une seule application.",
    },
    create: {
      id: DEMO_ORG_ID,
      name: "RitmoKit Demo Studio",
      slug: "ritmokit-demo",
      primaryColor: "#E11D48",
      welcomeCopy:
        "Bienvenue dans RitmoKit — sessions, Accueil, salles et équipe dans une seule application.",
    },
  });

  const location = await prisma.location.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "demo-studio" } },
    update: {
      latitude: 46.8139,
      longitude: -71.208,
      geofenceRadiusMeters: 150,
      isActive: true,
    },
    create: {
      id: DEMO_LOCATION_ID,
      organizationId: org.id,
      name: "Studio Démo — Québec",
      slug: "demo-studio",
      city: "Québec",
      timezone: "America/Toronto",
      latitude: 46.8139,
      longitude: -71.208,
      geofenceRadiusMeters: 150,
      isActive: true,
    },
  });

  const departmentIdBySlug = new Map<string, string>();
  for (const def of DANCE_DEPARTMENTS) {
    const station = await prisma.station.upsert({
      where: { locationId_nameFr: { locationId: location.id, nameFr: def.nameFr } },
      update: {
        slug: def.slug,
        kind: def.kind,
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        sortOrder: def.sortOrder,
        isActive: true,
      },
      create: {
        locationId: location.id,
        slug: def.slug,
        kind: def.kind,
        nameFr: def.nameFr,
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        sortOrder: def.sortOrder,
      },
    });
    departmentIdBySlug.set(def.slug, station.id);
  }

  const stationForRole = (role: (typeof STAFF_USERS)[number]["role"]) => {
    if (role === "OWNER" || role === "MANAGER") return departmentIdBySlug.get("direction")!;
    if (role === "FRONT_DESK") return departmentIdBySlug.get("accueil")!;
    if (role === "INSTRUCTOR") return departmentIdBySlug.get("instructeurs")!;
    return departmentIdBySlug.get("entretien")!;
  };

  for (const person of STAFF_USERS) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: { fullName: person.fullName, role: person.role },
      create: {
        id: person.id,
        email: person.email,
        fullName: person.fullName,
        role: person.role,
        employeeProfile: {
          create: {
            preferredLanguage: "FR",
            hourlyRate: person.role === "INSTRUCTOR" ? 45 : 18,
            maxHoursPerWeek: 40,
          },
        },
      },
    });

    await prisma.locationMember.upsert({
      where: { locationId_userId: { locationId: location.id, userId: person.id } },
      update: {
        isPrimary: person.role === "OWNER" || person.role === "MANAGER",
        stationId: stationForRole(person.role),
      },
      create: {
        locationId: location.id,
        userId: person.id,
        stationId: stationForRole(person.role),
        isPrimary: person.role === "OWNER" || person.role === "MANAGER",
      },
    });
  }

  console.log(`✓ Tenant ready: ${org.name} · ${location.name} (${location.id})`);
  return location.id;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const locationId = await bootstrapTenant();
  runScript("scripts/seed-dance-stations.ts", locationId);
  runScript("scripts/seed-dance-demo.ts", locationId);
  console.log("✓ RitmoKit dance demo seed complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

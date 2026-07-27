/**
 * Import Salsa Attitude horaires.json into RitmoKit dance models.
 *
 * Usage:
 *   npx tsx scripts/import-horaires.ts \
 *     --file "C:/Users/Ntlechi/Salsa Attitude/data/horaires.json" \
 *     --location <locationUuid> \
 *     --organization <organizationUuid> \
 *     --instructor <instructorUserUuid> \
 *     [--room-map 0:<stationUuid>,1:<stationUuid>,...]
 *
 * Requires DATABASE_URL. Defaults to 12/12 lead/follow seats.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/prisma";

type HorairesCourse = {
  name: string;
  start: string;
  end: string;
  room: number;
  soldout?: boolean;
  rate?: { regular?: number; couple?: number; student?: number };
};

type HorairesDay = {
  name: string;
  index: number;
  courses: HorairesCourse[];
};

type Horaires = {
  id: string;
  start: string;
  end: string;
  name: string;
  is_active?: boolean;
  days: HorairesDay[];
};

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function parseRoomMap(raw: string | undefined): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw) return map;
  for (const part of raw.split(",")) {
    const [k, v] = part.split(":");
    if (k && v) map.set(Number(k), v);
  }
  return map;
}

function inferLevel(title: string): "BEGINNER" | "INTERMEDIATE" | "ADVANCED" {
  const t = title.toLowerCase();
  if (t.includes("avanc") || t.includes("inter/")) return "ADVANCED";
  if (t.includes("inter")) return "INTERMEDIATE";
  return "BEGINNER";
}

function inferStyle(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("bachata")) return "Bachata";
  if (t.includes("kizomba") || t.includes("urban kiz")) return "Kizomba";
  if (t.includes("zouk")) return "Zouk";
  if (t.includes("salsa")) return "Salsa";
  return "Other";
}

function combineDateAndTime(dateIso: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCHours(h || 0, m || 0, 0, 0);
  return d;
}

async function ensureCourse(organizationId: string, title: string) {
  const existing = await prisma.course.findFirst({ where: { organizationId, title } });
  if (existing) return existing;
  return prisma.course.create({
    data: {
      organizationId,
      title,
      level: inferLevel(title),
      style: inferStyle(title),
    },
  });
}

async function main() {
  const file = arg("file") ?? "C:/Users/Ntlechi/Salsa Attitude/data/horaires.json";
  const locationId = arg("location");
  const organizationId = arg("organization");
  const instructorId = arg("instructor");
  const roomMap = parseRoomMap(arg("room-map"));

  if (!locationId || !organizationId || !instructorId) {
    console.error("Missing --location, --organization, or --instructor");
    process.exit(1);
  }

  const stations = await prisma.station.findMany({
    where: { locationId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (stations.length === 0) {
    console.error("No stations (rooms) for location");
    process.exit(1);
  }

  const horaires = JSON.parse(readFileSync(file, "utf8")) as Horaires[];
  let imported = 0;

  for (const h of horaires) {
    const season = await prisma.sessionSeason.create({
      data: {
        locationId,
        name: h.name,
        status: h.is_active ? "ACTIVE" : "DRAFT",
        bookingOpen: Boolean(h.is_active),
        startsOn: new Date(h.start),
        endsOn: new Date(h.end),
        publishOn: h.is_active ? new Date(h.start) : null,
      },
    });

    for (const day of h.days) {
      for (const course of day.courses) {
        const title = course.name.trim();
        const courseRow = await ensureCourse(organizationId, title);
        const roomId =
          roomMap.get(course.room) ?? stations[Math.min(course.room, stations.length - 1)]!.id;

        await prisma.classSession.create({
          data: {
            seasonId: season.id,
            courseId: courseRow.id,
            roomId,
            instructorId,
            dayOfWeek: day.index,
            startTime: combineDateAndTime(h.start, course.start),
            endTime: combineDateAndTime(h.start, course.end),
            maxLeads: 12,
            maxFollows: 12,
            priceRegular: course.rate?.regular ?? 0,
            priceCouple: course.rate?.couple ?? null,
            priceStudent: course.rate?.student ?? null,
          },
        });
        imported += 1;
      }
    }

    console.log(`Imported season ${season.name} (${season.id})`);
  }

  console.log(`Done — ${imported} class sessions`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

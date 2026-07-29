/**
 * Demo dance data — a full season of classes, instructors and parity-realistic
 * enrollments so the cockpit, Salles and Équipe pages render against real rows.
 *
 * Local / staging only. Re-runnable: the season, courses, classes and students
 * are keyed by stable names so a second run updates instead of duplicating.
 *
 * Usage:
 *   npx tsx scripts/seed-dance-demo.ts             # first location
 *   npx tsx scripts/seed-dance-demo.ts <locationId>
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SEASON_NAME = "Automne 2026";

/** Legacy demo identities → dance studio staff. Keyed by email. */
const STAFF = [
  {
    email: "chloe@ritmokit.com",
    fullName: "Chloé Tremblay",
    role: "INSTRUCTOR",
    department: "instructeurs",
    specialties: ["Salsa", "Rueda"],
    payType: "FLAT_PER_CLASS",
    payRate: 85,
  },
  {
    email: "max@ritmokit.com",
    fullName: "Maxime Bouchard",
    role: "INSTRUCTOR",
    department: "instructeurs",
    specialties: ["Bachata"],
    payType: "FLAT_PER_CLASS",
    payRate: 80,
  },
  {
    email: "employe@ritmokit.com",
    fullName: "Samuel Gagnon",
    role: "INSTRUCTOR",
    department: "instructeurs",
    specialties: ["Kizomba", "Bachata"],
    payType: "HOURLY",
    payRate: 46,
  },
  {
    email: "nina@ritmokit.com",
    fullName: "Nina Rodriguez",
    role: "INSTRUCTOR",
    department: "instructeurs",
    specialties: ["Salsa", "Cha-cha"],
    payType: "COMMISSION",
    payRate: 35,
  },
  {
    email: "theo@ritmokit.com",
    fullName: "Théo Lavoie",
    role: "INSTRUCTOR",
    department: "instructeurs",
    specialties: ["Cha-cha", "Rueda"],
    payType: "FLAT_PER_CLASS",
    payRate: 75,
  },
  {
    email: "jade@ritmokit.com",
    fullName: "Jade Pelletier",
    role: "FRONT_DESK",
    department: "accueil",
  },
  {
    email: "sofia@ritmokit.com",
    fullName: "Sofia Moreno",
    role: "FRONT_DESK",
    department: "accueil",
  },
  {
    email: "soir@ritmokit.com",
    fullName: "Léa Fortin",
    role: "EMPLOYEE",
    department: "entretien",
  },
  { email: "manager@ritmokit.com", department: "direction" },
  { email: "owner@ritmokit.com", department: "direction" },
] as const;

type ClassDef = {
  course: string;
  style: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  room: string;
  instructor: string;
  /** 1 = Monday … 6 = Saturday */
  day: number;
  hour: number;
  minute: number;
  durationMin: number;
  maxLeads: number;
  maxFollows: number;
  price: number;
  /** Leads / follows actually signed up — drives the parity widgets. */
  leads: number;
  follows: number;
};

const CLASSES: ClassDef[] = [
  // Monday
  { course: "Salsa Niveau 1", style: "Salsa", level: "BEGINNER", room: "studio-a", instructor: "chloe@ritmokit.com", day: 1, hour: 18, minute: 30, durationMin: 60, maxLeads: 16, maxFollows: 16, price: 180, leads: 14, follows: 20 },
  { course: "Salsa Niveau 2", style: "Salsa", level: "INTERMEDIATE", room: "studio-a", instructor: "chloe@ritmokit.com", day: 1, hour: 19, minute: 45, durationMin: 60, maxLeads: 14, maxFollows: 14, price: 195, leads: 11, follows: 14 },
  { course: "Bachata Niveau 1", style: "Bachata", level: "BEGINNER", room: "studio-b", instructor: "max@ritmokit.com", day: 1, hour: 18, minute: 30, durationMin: 60, maxLeads: 12, maxFollows: 12, price: 180, leads: 9, follows: 15 },
  // Tuesday
  { course: "Bachata Niveau 2", style: "Bachata", level: "INTERMEDIATE", room: "studio-a", instructor: "max@ritmokit.com", day: 2, hour: 19, minute: 0, durationMin: 60, maxLeads: 14, maxFollows: 14, price: 195, leads: 12, follows: 14 },
  { course: "Kizomba Niveau 1", style: "Kizomba", level: "BEGINNER", room: "studio-b", instructor: "employe@ritmokit.com", day: 2, hour: 18, minute: 0, durationMin: 60, maxLeads: 12, maxFollows: 12, price: 175, leads: 7, follows: 11 },
  { course: "Cha-cha Niveau 1", style: "Cha-cha", level: "BEGINNER", room: "studio-c", instructor: "theo@ritmokit.com", day: 2, hour: 20, minute: 15, durationMin: 60, maxLeads: 8, maxFollows: 8, price: 170, leads: 5, follows: 8 },
  // Wednesday
  { course: "Salsa Niveau 3", style: "Salsa", level: "ADVANCED", room: "studio-a", instructor: "nina@ritmokit.com", day: 3, hour: 19, minute: 30, durationMin: 75, maxLeads: 12, maxFollows: 12, price: 215, leads: 10, follows: 9 },
  { course: "Bachata Sensual", style: "Bachata", level: "ADVANCED", room: "studio-b", instructor: "max@ritmokit.com", day: 3, hour: 20, minute: 0, durationMin: 60, maxLeads: 10, maxFollows: 10, price: 205, leads: 8, follows: 10 },
  { course: "Kizomba Niveau 2", style: "Kizomba", level: "INTERMEDIATE", room: "studio-c", instructor: "employe@ritmokit.com", day: 3, hour: 18, minute: 15, durationMin: 60, maxLeads: 8, maxFollows: 8, price: 190, leads: 6, follows: 8 },
  // Thursday
  { course: "Salsa Niveau 1", style: "Salsa", level: "BEGINNER", room: "studio-b", instructor: "nina@ritmokit.com", day: 4, hour: 18, minute: 30, durationMin: 60, maxLeads: 12, maxFollows: 12, price: 180, leads: 10, follows: 12 },
  { course: "Rueda de Casino", style: "Rueda", level: "INTERMEDIATE", room: "studio-a", instructor: "chloe@ritmokit.com", day: 4, hour: 20, minute: 0, durationMin: 75, maxLeads: 14, maxFollows: 14, price: 200, leads: 12, follows: 13 },
  { course: "Cha-cha Niveau 2", style: "Cha-cha", level: "INTERMEDIATE", room: "studio-c", instructor: "theo@ritmokit.com", day: 4, hour: 19, minute: 0, durationMin: 60, maxLeads: 8, maxFollows: 8, price: 190, leads: 4, follows: 8 },
  // Saturday
  { course: "Atelier Salsa Styling", style: "Salsa", level: "INTERMEDIATE", room: "studio-a", instructor: "nina@ritmokit.com", day: 6, hour: 13, minute: 0, durationMin: 90, maxLeads: 16, maxFollows: 16, price: 95, leads: 9, follows: 21 },
  { course: "Bachata Débutant Express", style: "Bachata", level: "BEGINNER", room: "studio-b", instructor: "max@ritmokit.com", day: 6, hour: 11, minute: 0, durationMin: 90, maxLeads: 12, maxFollows: 12, price: 95, leads: 11, follows: 12 },
  { course: "Rueda Intensif", style: "Rueda", level: "ADVANCED", room: "studio-c", instructor: "theo@ritmokit.com", day: 6, hour: 15, minute: 0, durationMin: 90, maxLeads: 8, maxFollows: 8, price: 110, leads: 7, follows: 6 },
];

const FIRST_NAMES = [
  "Émilie", "Gabriel", "Camille", "Antoine", "Rosalie", "Félix", "Alice", "Olivier",
  "Charlotte", "William", "Béatrice", "Nathan", "Juliette", "Thomas", "Élodie", "Vincent",
  "Maude", "Simon", "Coralie", "Étienne", "Anaïs", "Raphaël", "Sarah", "Loïc",
  "Marianne", "Jérémie", "Noémie", "Alexis", "Laurence", "Philippe", "Éliane", "Mathieu",
];
const LAST_NAMES = [
  "Tremblay", "Gagnon", "Roy", "Côté", "Bouchard", "Gauthier", "Morin", "Lavoie",
  "Fortin", "Gagné", "Ouellet", "Pelletier", "Bélanger", "Lévesque", "Bergeron", "Leblanc",
];

/** Deterministic LCG so repeat runs produce the same roster. */
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function classDate(day: number, hour: number, minute: number) {
  // Anchor the recurring grid on a fixed week so times are stable across runs.
  const base = new Date(Date.UTC(2026, 8, 7)); // Mon 7 Sep 2026
  base.setUTCDate(base.getUTCDate() + (day - 1));
  base.setUTCHours(hour, minute, 0, 0);
  return base;
}

async function seedStaff(locationId: string) {
  const departments = await prisma.station.findMany({
    where: { locationId, kind: "DEPARTMENT", isActive: true },
    select: { id: true, slug: true },
  });
  const departmentIdBySlug = new Map(
    departments.filter((d) => d.slug).map((d) => [d.slug!, d.id]),
  );

  const instructorIdByEmail = new Map<string, string>();

  for (const person of STAFF) {
    const user = await prisma.user.findUnique({
      where: { email: person.email },
      select: { id: true },
    });
    if (!user) continue;

    if ("fullName" in person) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: person.fullName,
          role: person.role,
          specialties: "specialties" in person ? [...person.specialties] : [],
          instructorPayType: "payType" in person ? person.payType : null,
          instructorPayRate: "payRate" in person ? person.payRate : null,
        },
      });
    }

    const stationId = departmentIdBySlug.get(person.department);
    if (stationId) {
      await prisma.locationMember.updateMany({
        where: { locationId, userId: user.id },
        data: { stationId },
      });
    }

    instructorIdByEmail.set(person.email, user.id);
  }

  return instructorIdByEmail;
}

async function seedSchedule(
  locationId: string,
  organizationId: string,
  instructorIdByEmail: Map<string, string>,
) {
  const rooms = await prisma.station.findMany({
    where: { locationId, kind: "ROOM", isActive: true },
    select: { id: true, slug: true },
  });
  const roomIdBySlug = new Map(rooms.filter((r) => r.slug).map((r) => [r.slug!, r.id]));

  const existingSeason = await prisma.sessionSeason.findFirst({
    where: { locationId, name: SEASON_NAME },
    select: { id: true },
  });
  const season = existingSeason
    ? await prisma.sessionSeason.update({
        where: { id: existingSeason.id },
        data: { status: "ACTIVE", bookingOpen: true },
      })
    : await prisma.sessionSeason.create({
        data: {
          locationId,
          name: SEASON_NAME,
          status: "ACTIVE",
          bookingOpen: true,
          publishOn: new Date(Date.UTC(2026, 7, 1)),
          startsOn: new Date(Date.UTC(2026, 8, 7)),
          endsOn: new Date(Date.UTC(2026, 11, 13)),
        },
      });

  // Fresh grid each run — the demo schedule is fully described by CLASSES.
  await prisma.classSession.deleteMany({ where: { seasonId: season.id } });

  const courseIdByKey = new Map<string, string>();
  const classIds: { id: string; def: ClassDef }[] = [];

  for (const def of CLASSES) {
    const key = `${def.course}|${def.level}`;
    let courseId = courseIdByKey.get(key);
    if (!courseId) {
      const existing = await prisma.course.findFirst({
        where: { organizationId, title: def.course, level: def.level },
        select: { id: true },
      });
      const course = existing
        ? await prisma.course.update({
            where: { id: existing.id },
            data: { style: def.style },
          })
        : await prisma.course.create({
            data: {
              organizationId,
              title: def.course,
              level: def.level,
              style: def.style,
            },
          });
      courseId = course.id;
      courseIdByKey.set(key, courseId);
    }

    const roomId = roomIdBySlug.get(def.room);
    const instructorId = instructorIdByEmail.get(def.instructor);
    if (!roomId || !instructorId) continue;

    const startTime = classDate(def.day, def.hour, def.minute);
    const endTime = new Date(startTime.getTime() + def.durationMin * 60_000);

    const created = await prisma.classSession.create({
      data: {
        seasonId: season.id,
        courseId,
        roomId,
        instructorId,
        dayOfWeek: def.day,
        startTime,
        endTime,
        maxLeads: def.maxLeads,
        maxFollows: def.maxFollows,
        priceRegular: def.price,
        priceCouple: Math.round(def.price * 1.8),
        priceStudent: Math.round(def.price * 0.85),
      },
      select: { id: true },
    });
    classIds.push({ id: created.id, def });
  }

  return { season, classIds };
}

async function seedStudents(classIds: { id: string; def: ClassDef }[]) {
  const rng = makeRng(20260907);
  const studentIds: string[] = [];

  for (let i = 0; i < 90; i += 1) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    const email = `eleve${i + 1}@demo.salsaquebec.com`;
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      studentIds.push(existing.id);
      continue;
    }
    const id = randomUUID();
    await prisma.user.create({
      data: { id, email, fullName: `${first} ${last}`, role: "STUDENT", locale: "FR" },
    });
    studentIds.push(id);
  }

  let cursor = 0;
  const nextStudent = () => studentIds[cursor++ % studentIds.length];

  let enrolled = 0;
  let waitlisted = 0;

  for (const { id: sessionId, def } of classIds) {
    const seats: { role: "LEAD" | "FOLLOW"; index: number; cap: number }[] = [];
    for (let i = 0; i < def.leads; i += 1) seats.push({ role: "LEAD", index: i, cap: def.maxLeads });
    for (let i = 0; i < def.follows; i += 1) seats.push({ role: "FOLLOW", index: i, cap: def.maxFollows });

    for (const seat of seats) {
      const studentId = nextStudent();
      const isWaitlisted = seat.index >= seat.cap;
      const alreadyIn = await prisma.enrollment.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
        select: { id: true },
      });
      if (alreadyIn) continue;

      const paid = !isWaitlisted && rng() > 0.12;
      const tierRoll = rng();
      const pricingTier =
        tierRoll > 0.85 ? "STUDENT" : tierRoll > 0.7 ? "COUPLE" : "REGULAR";
      const amountCad =
        pricingTier === "STUDENT"
          ? Math.round(def.price * 0.85)
          : pricingTier === "COUPLE"
            ? Math.round(def.price * 1.8)
            : def.price;
      await prisma.enrollment.create({
        data: {
          sessionId,
          studentId,
          danceRole: seat.role,
          paid,
          paymentStatus: paid ? "PAID" : "NONE",
          paidAt: paid ? new Date() : null,
          pricingTier,
          amountCad,
          attended: !isWaitlisted && rng() > 0.25,
          waitlisted: isWaitlisted,
          waitlistedAt: isWaitlisted ? new Date() : null,
        },
      });
      if (isWaitlisted) waitlisted += 1;
      else enrolled += 1;
    }
  }

  return { students: studentIds.length, enrolled, waitlisted };
}

async function main() {
  const target = process.argv[2];
  const location = await prisma.location.findFirst({
    where: target ? { id: target } : {},
    select: { id: true, name: true, organizationId: true },
    orderBy: { name: "asc" },
  });
  if (!location) {
    console.error(target ? `No location with id ${target}` : "No locations found.");
    process.exit(1);
  }

  const instructorIdByEmail = await seedStaff(location.id);
  const { season, classIds } = await seedSchedule(
    location.id,
    location.organizationId,
    instructorIdByEmail,
  );
  const stats = await seedStudents(classIds);

  console.log(
    `✓ ${location.name} · saison "${season.name}" · ${classIds.length} cours · ` +
      `${stats.students} élèves · ${stats.enrolled} inscriptions · ${stats.waitlisted} en attente`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Legacy QSR demo seed (Mirok/Bati kitchen stations).
 *
 * For RitmoKit dance studios, prefer:
 *   npm run provision:franchise -- --org "…" --location "…" --owner-id …
 *   npm run seed:dance-stations -- <locationId>
 *   npm run seed:dance-demo -- <locationId>
 */
import "dotenv/config";
import { randomBytes, scryptSync } from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BATI_ORG_ID = "00000000-0000-0000-0000-000000000010";
const BATI_LOCATION_ID = "00000000-0000-0000-0000-000000000011";

/** Seed-only scrypt credentials (mirrors src/lib/punch/pin.ts — seed cannot import server-only). */
function seedPunchPinCredentials(pin: string): { salt: string; hash: string } {
  const pepper = process.env.PUNCH_PIN_PEPPER ?? "mirok-punch-pin-v1";
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(`${pepper}:${pin}`, salt, 32, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
  return { salt, hash };
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "bati" },
    update: {
      primaryColor: "#FF0013",
      welcomeCopy:
        "Ton application de travail. Horaires, formations, fiches de paie, et tout ce qu'il te faut pour réussir ici.",
    },
    create: {
      id: BATI_ORG_ID,
      name: "Bati",
      slug: "bati",
      primaryColor: "#FF0013",
      welcomeCopy:
        "Ton application de travail. Horaires, formations, fiches de paie, et tout ce qu'il te faut pour réussir ici.",
    },
  });

  const location = await prisma.location.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: "quebec" } },
    update: { latitude: 46.8139, longitude: -71.208, geofenceRadiusMeters: 150 },
    create: {
      id: BATI_LOCATION_ID,
      organizationId: org.id,
      name: "Bati — Québec",
      slug: "quebec",
      city: "Québec",
      timezone: "America/Toronto",
      latitude: 46.8139,
      longitude: -71.208,
      geofenceRadiusMeters: 150,
    },
  });

  const stationDefs = [
    { slug: "entretiens", nameFr: "Entretiens", nameEn: "Maintenance", nameEs: "Mantenimiento", colorHex: "#64748b", tipPoints: 0.8, sortOrder: 1 },
    { slug: "cuisine", nameFr: "Cuisine", nameEn: "Kitchen", nameEs: "Cocina", colorHex: "#f97316", tipPoints: 0.8, sortOrder: 2 },
    { slug: "services", nameFr: "Services", nameEn: "Counter", nameEs: "Servicio", colorHex: "#3b82f6", tipPoints: 1.2, sortOrder: 3 },
    { slug: "emballage", nameFr: "Emballage", nameEn: "Packaging", nameEs: "Empaque", colorHex: "#10b981", tipPoints: 1.0, sortOrder: 4 },
    { slug: "gerants-jour", nameFr: "Gérants Jour", nameEn: "Day Managers", nameEs: "Gerentes día", colorHex: "#8b5cf6", tipPoints: 1.0, sortOrder: 5 },
    { slug: "gerants-soir", nameFr: "Gérants Soir", nameEn: "Night Managers", nameEs: "Gerentes noche", colorHex: "#6366f1", tipPoints: 1.0, sortOrder: 6 },
  ] as const;

  const stationIdBySlug: Record<string, string> = {};
  for (const def of stationDefs) {
    const station = await prisma.station.upsert({
      where: { locationId_slug: { locationId: location.id, slug: def.slug } },
      update: {
        nameFr: def.nameFr,
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        tipPoints: def.tipPoints,
        sortOrder: def.sortOrder,
        isActive: true,
      },
      create: {
        locationId: location.id,
        slug: def.slug,
        nameFr: def.nameFr,
        nameEn: def.nameEn,
        nameEs: def.nameEs,
        colorHex: def.colorHex,
        tipPoints: def.tipPoints,
        sortOrder: def.sortOrder,
      },
    });
    stationIdBySlug[def.slug] = station.id;
  }

  const legacyStationSlug = {
    CUISINE: "cuisine",
    COMPTOIR: "services",
    EMBALLAGE: "emballage",
  } as const;

  const owner = await prisma.user.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {
      email: "owner@ritmokit.com",
      fullName: "RitmoKit Owner",
      role: "OWNER",
    },
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      email: "owner@ritmokit.com",
      fullName: "RitmoKit Owner",
      role: "OWNER",
    },
  });

  const manager = await prisma.user.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      email: "manager@ritmokit.com",
      fullName: "Studio Manager",
      role: "MANAGER",
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      email: "manager@ritmokit.com",
      fullName: "Studio Manager",
      role: "MANAGER",
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: "employe@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      email: "employe@mirok.ca",
      fullName: "Sam Employé",
      role: "EMPLOYEE",
      employeeProfile: {
        create: {
          preferredLanguage: "FR",
          hourlyRate: 16.5,
          maxHoursPerWeek: 40,
        },
      },
    },
  });

  const nightEmployee = await prisma.user.upsert({
    where: { email: "soir@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      email: "soir@mirok.ca",
      fullName: "Léa Soir",
      role: "EMPLOYEE",
      employeeProfile: {
        create: {
          preferredLanguage: "FR",
          hourlyRate: 17.25,
          maxHoursPerWeek: 40,
        },
      },
    },
  });

  // Bassin élargi pour démontrer le moteur Auto-Planif (distribution multi-
  // employés respectant disponibilités + repos CNESST de 32h).
  const cuisineDay2 = await prisma.user.upsert({
    where: { email: "chloe@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000004",
      email: "chloe@mirok.ca",
      fullName: "Chloé Cuisine",
      role: "EMPLOYEE",
      employeeProfile: {
        create: { preferredLanguage: "FR", hourlyRate: 16.0, maxHoursPerWeek: 24 },
      },
    },
  });

  const comptoirDay = await prisma.user.upsert({
    where: { email: "jade@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000005",
      email: "jade@mirok.ca",
      fullName: "Jade Comptoir",
      role: "EMPLOYEE",
      employeeProfile: {
        create: { preferredLanguage: "FR", hourlyRate: 15.75, maxHoursPerWeek: 30 },
      },
    },
  });

  const emballage1 = await prisma.user.upsert({
    where: { email: "theo@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000006",
      email: "theo@mirok.ca",
      fullName: "Théo Emballage",
      role: "EMPLOYEE",
      employeeProfile: {
        create: { preferredLanguage: "FR", hourlyRate: 15.75, maxHoursPerWeek: 30 },
      },
    },
  });

  const emballage2 = await prisma.user.upsert({
    where: { email: "nina@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000007",
      email: "nina@mirok.ca",
      fullName: "Nina Emballage",
      role: "EMPLOYEE",
      employeeProfile: {
        create: { preferredLanguage: "FR", hourlyRate: 15.75, maxHoursPerWeek: 24 },
      },
    },
  });

  const cuisineEvening = await prisma.user.upsert({
    where: { email: "max@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000008",
      email: "max@mirok.ca",
      fullName: "Max Cuisine",
      role: "EMPLOYEE",
      employeeProfile: {
        create: { preferredLanguage: "FR", hourlyRate: 16.25, maxHoursPerWeek: 20 },
      },
    },
  });

  const comptoirWeekend = await prisma.user.upsert({
    where: { email: "sofia@mirok.ca" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000009",
      email: "sofia@mirok.ca",
      fullName: "Sofia Comptoir",
      role: "EMPLOYEE",
      employeeProfile: {
        create: { preferredLanguage: "FR", hourlyRate: 15.75, maxHoursPerWeek: 20 },
      },
    },
  });

  const floorMembers = [
    { user: owner, station: "COMPTOIR" as const },
    { user: manager, station: "COMPTOIR" as const },
    { user: employee, station: "CUISINE" as const },
    { user: nightEmployee, station: "COMPTOIR" as const },
    { user: cuisineDay2, station: "CUISINE" as const },
    { user: comptoirDay, station: "COMPTOIR" as const },
    { user: emballage1, station: "EMBALLAGE" as const },
    { user: emballage2, station: "EMBALLAGE" as const },
    { user: cuisineEvening, station: "CUISINE" as const },
    { user: comptoirWeekend, station: "COMPTOIR" as const },
  ];

  for (const { user, station } of floorMembers) {
    const stationId = stationIdBySlug[legacyStationSlug[station]];
    await prisma.locationMember.upsert({
      where: { locationId_userId: { locationId: location.id, userId: user.id } },
      update: { stationId },
      create: { locationId: location.id, userId: user.id, stationId },
    });
  }

  const stationChannels = [
    { slug: "annonces", name: "Annonces", type: "ANNOUNCEMENTS" as const, stationSlug: null, isReadOnly: true },
    { slug: "cuisine", name: "Cuisine", type: "STATION" as const, stationSlug: "cuisine" as const, isReadOnly: false },
    { slug: "comptoir", name: "Comptoir", type: "STATION" as const, stationSlug: "services" as const, isReadOnly: false },
    { slug: "emballage", name: "Emballage", type: "STATION" as const, stationSlug: "emballage" as const, isReadOnly: false },
  ];

  const stationByUserId = new Map(
    floorMembers.map((m) => [m.user.id, legacyStationSlug[m.station]]),
  );

  for (const ch of stationChannels) {
    const channel = await prisma.chatChannel.upsert({
      where: { locationId_slug: { locationId: location.id, slug: ch.slug } },
      update: {},
      create: {
        locationId: location.id,
        type: ch.type,
        name: ch.name,
        slug: ch.slug,
        stationId: ch.stationSlug ? stationIdBySlug[ch.stationSlug] : null,
        isReadOnly: ch.isReadOnly,
      },
    });

    for (const { user: member } of floorMembers) {
      const isManager = member.role === "OWNER" || member.role === "MANAGER" || member.role === "ADMIN";
      const memberStation = stationByUserId.get(member.id);

      // Canaux STATION : gérants voient tout ; employés uniquement leur poste
      // (aligné sur le trigger `handle_member_station_change`, migration 0005).
      if (ch.type === "STATION" && !isManager && memberStation !== ch.stationSlug) {
        continue;
      }

      const canPost = ch.isReadOnly ? isManager : true;

      await prisma.chatChannelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId: member.id } },
        update: { canPost },
        create: { channelId: channel.id, userId: member.id, canPost },
      });
    }
  }

  // Canal privé Owner/Managers — cible des alertes poussées par les agents IA
  // (ex: Agent Retard). Les employés n'en sont volontairement pas membres.
  const managementChannel = await prisma.chatChannel.upsert({
    where: { locationId_slug: { locationId: location.id, slug: "gestion" } },
    update: {},
    create: {
      locationId: location.id,
      type: "MANAGEMENT",
      name: "Gestion",
      slug: "gestion",
    },
  });

  for (const member of [owner, manager]) {
    await prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId: managementChannel.id, userId: member.id } },
      update: {},
      create: { channelId: managementChannel.id, userId: member.id },
    });
  }

  await prisma.shift.deleteMany({ where: { locationId: location.id } });

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(11, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(dayStart.getHours() + 6);

  const dayShift = await prisma.shift.create({
    data: {
      locationId: location.id,
      stationId: stationIdBySlug.cuisine,
      period: "DAY",
      employeeId: employee.id,
      createdById: manager.id,
      startsAt: dayStart,
      endsAt: dayEnd,
      breakMinutes: 30,
      breakRequiredMinutes: 30,
      status: "PUBLISHED",
    },
  });

  const nightStart = new Date(now);
  nightStart.setDate(nightStart.getDate() + 1);
  nightStart.setHours(18, 0, 0, 0);
  const nightEnd = new Date(nightStart);
  nightEnd.setHours(nightStart.getHours() + 8);

  await prisma.shift.create({
    data: {
      locationId: location.id,
      stationId: stationIdBySlug.services,
      period: "NIGHT",
      employeeId: nightEmployee.id,
      createdById: manager.id,
      startsAt: nightStart,
      endsAt: nightEnd,
      breakMinutes: 30,
      breakRequiredMinutes: 30,
      status: "PUBLISHED",
    },
  });

  const rushChannel = await prisma.chatChannel.upsert({
    where: { locationId_slug: { locationId: location.id, slug: "rush-midi-demo" } },
    update: {},
    create: {
      locationId: location.id,
      type: "SHIFT_GROUP",
      name: "Rush Midi",
      slug: "rush-midi-demo",
      shiftId: dayShift.id,
      stationId: stationIdBySlug.cuisine,
    },
  });

  for (const member of [employee, manager]) {
    await prisma.chatChannelMember.upsert({
      where: { channelId_userId: { channelId: rushChannel.id, userId: member.id } },
      update: {},
      create: { channelId: rushChannel.id, userId: member.id },
    });
  }

  const sop = await prisma.sop.upsert({
    where: { id: "00000000-0000-0000-0000-000000000101" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000101",
      organizationId: org.id,
      scope: "CORPORATE",
      title: "Ouverture de la cuisine",
      body: "1. Allumer les équipements.\n2. Vérifier les températures.\n3. Préparer le poste de mise en place.",
      steps: [
        { order: 1, title: "Équipements", body: "Allumer friteuses et plaques." },
        { order: 2, title: "Températures", body: "Vérifier thermomètres et registre." },
        { order: 3, title: "Mise en place", body: "Préparer postes selon fiche Bati." },
      ],
      stationId: stationIdBySlug.cuisine,
      role: "EMPLOYEE",
    },
  });

  const cuisineChannel = await prisma.chatChannel.findUniqueOrThrow({
    where: { locationId_slug: { locationId: location.id, slug: "cuisine" } },
  });

  await prisma.sopChannelPin.upsert({
    where: { sopId_channelId: { sopId: sop.id, channelId: cuisineChannel.id } },
    update: {},
    create: {
      sopId: sop.id,
      channelId: cuisineChannel.id,
      pinnedById: manager.id,
    },
  });

  await prisma.chatMessage.create({
    data: {
      channelId: cuisineChannel.id,
      authorId: employee.id,
      contentType: "TEXT",
      body: "Je serai en retard de 15 min ce matin — bus en panne.",
      metadata: { intent: "late_arrival", minutesLate: 15, station: "CUISINE" },
    },
  });

  // Grille de ventes horaires typique QSR — rush du midi (11h-13h30) et du
  // soir (17h30-19h30), creux en matinée/soirée tardive. Weekend (ven/sam)
  // amplifié, dimanche plus calme. Alimente le Live Labor Cost % / SPLH.
  const BASE_HOURLY_SALES: Record<number, number> = {
    6: 40, 7: 90, 8: 140, 9: 160, 10: 190,
    11: 340, 12: 680, 13: 520, 14: 230, 15: 190,
    16: 210, 17: 400, 18: 640, 19: 500, 20: 300,
    21: 190, 22: 110, 23: 60,
  };
  const DAY_MULTIPLIER: Record<number, number> = {
    0: 0.8, 1: 0.9, 2: 0.9, 3: 1, 4: 1.05, 5: 1.3, 6: 1.35,
  };

  await prisma.hourlySalesProjection.deleteMany({ where: { locationId: location.id } });

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const base = BASE_HOURLY_SALES[hour] ?? 0;
      const amount = Math.round(base * (DAY_MULTIPLIER[dayOfWeek] ?? 1) * 100) / 100;

      await prisma.hourlySalesProjection.upsert({
        where: { locationId_dayOfWeek_hour: { locationId: location.id, dayOfWeek, hour } },
        update: { amount },
        create: { locationId: location.id, dayOfWeek, hour, amount },
      });
    }
  }

  // Punch de démonstration sur le quart du jour de Sam — retiré pour laisser
  // le parcours d'onboarding RH démontrable de bout en bout (employe@mirok.ca).

  // Disponibilités récurrentes — carburant du moteur Auto-Planif : sans elles,
  // aucun candidat n'est jamais éligible (voir findAvailableReplacements).
  async function seedAvailability(
    profileId: string,
    slots: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ) {
    await prisma.employeeAvailability.deleteMany({ where: { profileId } });
    for (const slot of slots) {
      await prisma.employeeAvailability.create({
        data: { profileId, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime, isRecurring: true },
      });
    }
  }

  const [samProfile, leaProfile, chloeProfile, jadeProfile, theoProfile, ninaProfile, maxProfile, sofiaProfile] =
    await Promise.all([
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: employee.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: nightEmployee.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: cuisineDay2.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: comptoirDay.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: emballage1.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: emballage2.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: cuisineEvening.id } }),
      prisma.employeeProfile.findUniqueOrThrow({ where: { userId: comptoirWeekend.id } }),
    ]);

  await seedAvailability(
    samProfile.id,
    [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "10:00", endTime: "18:00" })),
  );
  await seedAvailability(
    chloeProfile.id,
    [5, 6, 0].map((dayOfWeek) => ({ dayOfWeek, startTime: "11:00", endTime: "21:00" })),
  );
  await seedAvailability(
    leaProfile.id,
    [2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "16:00", endTime: "23:30" })),
  );
  await seedAvailability(
    jadeProfile.id,
    [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "10:00", endTime: "16:00" })),
  );
  await seedAvailability(
    theoProfile.id,
    [3, 4, 5, 6, 0].map((dayOfWeek) => ({ dayOfWeek, startTime: "11:00", endTime: "19:00" })),
  );
  await seedAvailability(
    ninaProfile.id,
    [1, 2, 3, 6, 0].map((dayOfWeek) => ({ dayOfWeek, startTime: "12:00", endTime: "20:00" })),
  );
  await seedAvailability(
    maxProfile.id,
    [1, 2, 3, 4].map((dayOfWeek) => ({ dayOfWeek, startTime: "17:00", endTime: "23:00" })),
  );
  await seedAvailability(
    sofiaProfile.id,
    [0, 1].map((dayOfWeek) => ({ dayOfWeek, startTime: "16:00", endTime: "23:00" })),
  );

  // Cibles de dotation par station — pilote le Score de Couverture et
  // l'Auto-Planif (src/lib/scheduling). Repères SPLH alignés sur les
  // benchmarks QSR nord-américains, mais persistées pour que l'écran de
  // réglages reflète un choix explicite du gérant plutôt qu'un fallback
  // silencieux.
  const staffingDefaults = [
    { slug: "cuisine" as const, targetSplh: 65, salesSharePercent: 45, minHeadcount: 1, maxHeadcount: 5 },
    { slug: "services" as const, targetSplh: 50, salesSharePercent: 40, minHeadcount: 1, maxHeadcount: 4 },
    { slug: "emballage" as const, targetSplh: 80, salesSharePercent: 15, minHeadcount: 1, maxHeadcount: 3 },
  ];
  for (const profile of staffingDefaults) {
    const stationId = stationIdBySlug[profile.slug];
    await prisma.staffingProfile.upsert({
      where: { locationId_stationId: { locationId: location.id, stationId } },
      update: {
        targetSplh: profile.targetSplh,
        salesSharePercent: profile.salesSharePercent,
        minHeadcount: profile.minHeadcount,
        maxHeadcount: profile.maxHeadcount,
      },
      create: {
        locationId: location.id,
        stationId,
        targetSplh: profile.targetSplh,
        salesSharePercent: profile.salesSharePercent,
        minHeadcount: profile.minHeadcount,
        maxHeadcount: profile.maxHeadcount,
      },
    });
  }

  const onboardingModules = [
    {
      id: "00000000-0000-0000-0000-000000000205",
      title: "Les valeurs Bati",
      summary: "Valeurs, mission et attentes dès le premier jour.",
      body: "Découvrez l'esprit Bati : qualité, rapidité et respect du client. Ce module d'accueil est obligatoire avant votre premier quart.",
      steps: [
        { order: 1, title: "Pourquoi Bati existe", body: "Servir des bowls frais et rapides avec un sourire authentique." },
        { order: 2, title: "Les 5 valeurs", body: "Communiquer, s'entraider entre stations et signaler les problèmes tôt." },
        { order: 3, title: "Quiz", body: "Valider la compréhension des standards plancher." },
      ],
      sortOrder: 0,
      unlockDay: 1,
      estimatedMinutes: 10,
    },
    {
      id: "00000000-0000-0000-0000-000000000206",
      title: "Le système Bati",
      summary: "Mirok, horaires, pointeuse et messages d'équipe.",
      body: "Apprenez à utiliser Mirok au quotidien : quarts, pointeuse, messages et alertes.",
      steps: [
        { order: 1, title: "App Mirok", body: "Installer la PWA et activer les notifications." },
        { order: 2, title: "Pointeuse", body: "Pointer à l'heure avec ton NIP sur la tablette." },
      ],
      sortOrder: 1,
      unlockDay: 2,
      estimatedMinutes: 12,
    },
    {
      id: "00000000-0000-0000-0000-000000000207",
      title: "Accueil et commande",
      summary: "Standards d'accueil client au comptoir.",
      body: "Accueillir, prendre la commande et confirmer clairement.",
      steps: [
        { order: 1, title: "Accueil", body: "Saluer dans les 5 secondes." },
        { order: 2, title: "Commande", body: "Répéter et confirmer avant l'encaissement." },
      ],
      sortOrder: 2,
      unlockDay: 3,
      estimatedMinutes: 7,
    },
    {
      id: "00000000-0000-0000-0000-000000000208",
      title: "Assemblage et précision",
      summary: "Portionnement et rythme en ligne.",
      body: "Respecter les portions, l'ordre d'assemblage et la précision.",
      steps: [
        { order: 1, title: "Portions", body: "Suivre les scoop standards." },
        { order: 2, title: "Rythme", body: "Garder le flow sans sacrifier la qualité." },
      ],
      sortOrder: 3,
      unlockDay: 4,
      estimatedMinutes: 10,
    },
    {
      id: "00000000-0000-0000-0000-000000000209",
      title: "Propreté en continu",
      summary: "Hygiène MAPAQ et nettoyage en continu.",
      body: "Formation d'intégration MAPAQ : lavage des mains, zones propres/sales et signalement des incidents.",
      steps: [
        { order: 1, title: "Lavage des mains", body: "30 secondes minimum entre chaque manipulation d'aliments." },
        { order: 2, title: "Zones propres / sales", body: "Ne jamais croiser ustensiles entre zones." },
        { order: 3, title: "Incidents", body: "Signaler immédiatement tout risque au gérant." },
      ],
      sortOrder: 4,
      unlockDay: 5,
      estimatedMinutes: 8,
    },
  ] as const;

  for (const trainingModule of onboardingModules) {
    await prisma.formationModule.upsert({
      where: { id: trainingModule.id },
      update: {
        title: trainingModule.title,
        summary: trainingModule.summary,
        body: trainingModule.body,
        steps: trainingModule.steps,
        sortOrder: trainingModule.sortOrder,
        estimatedMinutes: trainingModule.estimatedMinutes,
        unlockDay: trainingModule.unlockDay,
      },
      create: {
        id: trainingModule.id,
        organizationId: org.id,
        kind: "ONBOARDING",
        title: trainingModule.title,
        summary: trainingModule.summary,
        body: trainingModule.body,
        steps: trainingModule.steps,
        stationId: null,
        isMandatory: true,
        requiresSignature: true,
        sortOrder: trainingModule.sortOrder,
        estimatedMinutes: trainingModule.estimatedMinutes,
        unlockDay: trainingModule.unlockDay,
      },
    });
  }

  const handbookSignedAt = new Date("2026-05-08T10:00:00.000Z");
  // Non-weak demo PIN for kiosk (1234 is rejected by isWeakPunchPin).
  const nightEmployeePin = seedPunchPinCredentials("4829");

  await prisma.employeeHrProfile.upsert({
    where: { userId: nightEmployee.id },
    update: {
      onboardingStatus: "COMPLETED",
      emergencyContactName: "Marc Soir",
      emergencyContactPhone: "418-555-0199",
      hasSignedHandbook: true,
      handbookSignatureName: "Léa Soir",
      handbookSignedAt,
      handbookIpAddress: "127.0.0.1",
      punchPinHash: nightEmployeePin.hash,
      punchPinSalt: nightEmployeePin.salt,
    },
    create: {
      userId: nightEmployee.id,
      onboardingStatus: "COMPLETED",
      emergencyContactName: "Marc Soir",
      emergencyContactPhone: "418-555-0199",
      hasSignedHandbook: true,
      handbookSignatureName: "Léa Soir",
      handbookSignedAt,
      handbookIpAddress: "127.0.0.1",
      punchPinHash: nightEmployeePin.hash,
      punchPinSalt: nightEmployeePin.salt,
    },
  });

  await prisma.workplaceConventionSignature.upsert({
    where: {
      userId_version: { userId: nightEmployee.id, version: "1.0" },
    },
    update: {},
    create: {
      userId: nightEmployee.id,
      version: "1.0",
      signatureName: "Léa Soir",
      signedAt: handbookSignedAt,
      ipAddress: "127.0.0.1",
    },
  });

  for (const moduleId of onboardingModules.map((m) => m.id)) {
    await prisma.employeeFormationProgress.upsert({
      where: { userId_moduleId: { userId: nightEmployee.id, moduleId } },
      update: {},
      create: {
        userId: nightEmployee.id,
        moduleId,
        status: "COMPLETED",
        signatureName: "Léa Soir",
        signedAt: handbookSignedAt,
        ipAddress: "127.0.0.1",
        completedAt: handbookSignedAt,
      },
    });
  }

  await prisma.employeeHrProfile.deleteMany({ where: { userId: employee.id } });

  // Convention de partage des pourboires votée par l'équipe Bati (LNT art. 50).
  const votedAt = new Date("2026-05-12T16:00:00.000Z");
  const agreementText = `CONVENTION DE PARTAGE DES POURBOIRES — BATI QUÉBEC

Les employés de la succursale Bati — Québec conviennent de partager les pourboires collectés selon les modalités suivantes, conformément à l'article 50 de la Loi sur les normes du travail (LNT).

Poids par station : Comptoir 1,2× · Emballage 1,0× · Cuisine 0,8×
Calcul : Part = (Heures nettes × Poids station) / Total des points × Montant du pot
Fréquence : Distribution journalière après clôture POS.`;

  const tipConfig = await prisma.tipPoolConfig.upsert({
    where: { locationId: location.id },
    update: {
      isActive: true,
      status: "APPROVED",
      agreementText,
      votedAt,
    },
    create: {
      locationId: location.id,
      isActive: true,
      status: "APPROVED",
      agreementText,
      votedAt,
    },
  });

  await prisma.tipPoolVote.deleteMany({ where: { configId: tipConfig.id } });
  for (const voter of [employee, nightEmployee]) {
    await prisma.tipPoolVote.create({
      data: {
        configId: tipConfig.id,
        userId: voter.id,
        isApproved: true,
        signatureName: voter.fullName,
        ipAddress: "127.0.0.1",
        signedAt: votedAt,
      },
    });
  }

  // Distribution de démo — datée d'hier pour laisser la journée du jour
  // "ouverte" et démontrer l'auto-remplissage Cluster POS sur la clôture.
  const distributionDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const punchIn = new Date(dayStart.getTime() - 5 * 60 * 1000);
  const punchOut = new Date(dayEnd.getTime() + 10 * 60 * 1000);
  const grossHours = (punchOut.getTime() - punchIn.getTime()) / (1000 * 60 * 60);
  const workedHours = Math.max(grossHours - 30 / 60, 0);
  const weightedScore = workedHours * 0.8;
  const totalTips = 185.5;

  await prisma.tipDistribution.deleteMany({ where: { locationId: location.id } });
  const distribution = await prisma.tipDistribution.create({
    data: {
      locationId: location.id,
      distributionDate,
      totalTipsCollected: totalTips,
      totalWeightedHours: weightedScore,
      valuePerPoint: totalTips / weightedScore,
      distributedById: manager.id,
    },
  });
  await prisma.shiftTipEarned.create({
    data: {
      shiftId: dayShift.id,
      distributionId: distribution.id,
      amountPaid: totalTips,
      weightedScore,
      workedHours,
      stationPoints: 0.8,
    },
  });

  const safetyModules = [
    {
      id: "00000000-0000-0000-0000-000000000201",
      stationSlug: "cuisine" as const,
      title: "Sécurité cuisine — CNESST",
      summary: "Équipements, brûlures, couteaux et EPI obligatoires avant le premier service.",
      body: "Ce module couvre les risques CNESST spécifiques à la station cuisine chez Bati : manipulation des friteuses, zones chaudes, port des gants anti-coupure et signalement des incidents.",
      steps: [
        { order: 1, title: "Équipements chauds", body: "Ne jamais surcharger les paniers de friteuse. Attendre 30 s après arrêt avant nettoyage." },
        { order: 2, title: "Couteaux & découpe", body: "Gant anti-coupure obligatoire. Planche stable, doigts repliés, lame vers l'extérieur au lavage." },
        { order: 3, title: "Signalement", body: "Tout incident ou quasi-accident doit être signalé au gérant et consigné dans Mirok le jour même." },
      ],
      sortOrder: 0,
      estimatedMinutes: 8,
    },
    {
      id: "00000000-0000-0000-0000-000000000202",
      stationSlug: "services" as const,
      title: "Sécurité comptoir — CNESST",
      summary: "Ergonomie, glissades, hygiène mains et gestion des clients.",
      body: "Formation obligatoire pour tout employé au comptoir Bati : posture au POS, nettoyage des surfaces et procédure en cas de déversement.",
      steps: [
        { order: 1, title: "Posture & ergonomie", body: "Alterner les tâches debout toutes les 2 h. Tapis anti-fatigue en place." },
        { order: 2, title: "Hygiène", body: "Lavage des mains 30 s minimum entre chaque manipulation d'aliments et encaissement." },
        { order: 3, title: "Déversement", body: "Baliser, nettoyer, sécher. Aviser la cuisine si contamination croisée possible." },
      ],
      sortOrder: 0,
      estimatedMinutes: 6,
    },
    {
      id: "00000000-0000-0000-0000-000000000203",
      stationSlug: "emballage" as const,
      title: "Sécurité emballage — CNESST",
      summary: "Manutention, allergies et chaîne du froid à la sortie.",
      body: "Procédures CNESST pour l'emballage : charges lourdes, étiquetage allergènes et contrôle température des sacs chauds/froids.",
      steps: [
        { order: 1, title: "Manutention", body: "Soulever avec les jambes, pas le dos. Max 15 kg par caisse Bati." },
        { order: 2, title: "Allergènes", body: "Vérifier l'autocollant allergène sur chaque commande livraison." },
        { order: 3, title: "Chaîne du froid", body: "Séparer sacs chauds et froids. Glace réfrigérante pour boissons > 15 min de trajet." },
      ],
      sortOrder: 0,
      estimatedMinutes: 7,
    },
  ] as const;

  for (const trainingModule of safetyModules) {
    await prisma.formationModule.upsert({
      where: { id: trainingModule.id },
      update: {},
      create: {
        id: trainingModule.id,
        organizationId: org.id,
        kind: "SAFETY",
        title: trainingModule.title,
        summary: trainingModule.summary,
        body: trainingModule.body,
        steps: trainingModule.steps,
        stationId: stationIdBySlug[trainingModule.stationSlug],
        isMandatory: true,
        requiresSignature: true,
        sortOrder: trainingModule.sortOrder,
        estimatedMinutes: trainingModule.estimatedMinutes,
      },
    });
  }

  await prisma.formationModule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000204" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000204",
      organizationId: org.id,
      sopId: sop.id,
      kind: "SOP",
      title: "Ouverture de la cuisine — module interactif",
      summary: "Checklist Bati pour démarrer le service cuisine.",
      body: "Validez chaque étape d'ouverture avant le premier client. Ce module reprend la SOP corporative épinglée sur #cuisine.",
      steps: [
        { order: 1, title: "Équipements", body: "Allumer friteuses et plaques. Vérifier voyants et ventilation." },
        { order: 2, title: "Températures", body: "Thermomètres frigos à ≤ 4 °C. Consigner dans le registre Mirok." },
        { order: 3, title: "Mise en place", body: "Préparer postes selon fiche Bati du jour." },
      ],
      stationId: stationIdBySlug.cuisine,
      isMandatory: true,
      requiresSignature: true,
      sortOrder: 1,
      estimatedMinutes: 5,
    },
  });

  // Un module sans affectation n'est visible de personne. On applique la même
  // règle que la migration de reprise : poste renseigné → STATION, sinon
  // EVERYONE. Idempotent, donc rejouable à chaque `db seed`.
  const seededModules = await prisma.formationModule.findMany({
    where: { assignments: { none: {} } },
    select: { id: true, stationId: true },
  });
  if (seededModules.length > 0) {
    await prisma.formationAssignment.createMany({
      data: seededModules.map((formationModule) => ({
        moduleId: formationModule.id,
        audience: formationModule.stationId ? ("STATION" as const) : ("EVERYONE" as const),
        stationId: formationModule.stationId,
      })),
    });
  }

  await prisma.employeeFormationProgress.upsert({
    where: {
      userId_moduleId: {
        userId: nightEmployee.id,
        moduleId: "00000000-0000-0000-0000-000000000202",
      },
    },
    update: {},
    create: {
      userId: nightEmployee.id,
      moduleId: "00000000-0000-0000-0000-000000000202",
      status: "COMPLETED",
      signatureName: "Léa Soir",
      signedAt: new Date("2026-05-10T14:30:00Z"),
      ipAddress: "127.0.0.1",
      completedAt: new Date("2026-05-10T14:30:00Z"),
    },
  });

  // Intégration Cluster POS — active dès le seed pour que le webhook de
  // production trouve immédiatement la succursale via son `externalId`.
  // Secret de démo uniquement : en production, générer via
  // `openssl rand -hex 32` et ne jamais le committer.
  const CLUSTER_EXTERNAL_LOCATION_ID = "BATI-QC-001";
  const CLUSTER_DEV_WEBHOOK_SECRET = "cluster_dev_secret_do_not_use_in_prod";

  await prisma.posIntegration.upsert({
    where: { locationId: location.id },
    update: {
      externalId: CLUSTER_EXTERNAL_LOCATION_ID,
      webhookSecret: CLUSTER_DEV_WEBHOOK_SECRET,
      isActive: true,
    },
    create: {
      locationId: location.id,
      provider: "CLUSTER",
      externalId: CLUSTER_EXTERNAL_LOCATION_ID,
      webhookSecret: CLUSTER_DEV_WEBHOOK_SECRET,
      isActive: true,
    },
  });

  // Ventes réelles du jour (simulant des factures déjà reçues par webhook
  // Cluster) — remplace la projection statique dans le Live Labor Cost %
  // et alimente l'auto-remplissage de la clôture des pourboires.
  const posDatePure = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const CLUSTER_DEMO_HOURS: Record<number, { netSales: number; tipsCollected: number }> = {
    11: { netSales: 356.4, tipsCollected: 53.5 },
    12: { netSales: 712.8, tipsCollected: 106.9 },
    13: { netSales: 545.1, tipsCollected: 81.8 },
  };

  for (const [hourKey, values] of Object.entries(CLUSTER_DEMO_HOURS)) {
    const hour = Number(hourKey);
    await prisma.posSalesHourly.upsert({
      where: { locationId_date_hour: { locationId: location.id, date: posDatePure, hour } },
      update: values,
      create: { locationId: location.id, date: posDatePure, hour, ...values },
    });
  }

  // Journal d'ingestion — alimente le panneau /settings/manager/pos.
  await prisma.posIngestionLog.deleteMany({ where: { locationId: location.id } });
  const demoIngestions = [
    { orderId: "CLU-10482", netSales: 42.5, tipsCollected: 6.38, status: "PROCESSED" as const, minutesAgo: 4 },
    { orderId: "CLU-10481", netSales: 28.9, tipsCollected: 4.33, status: "PROCESSED" as const, minutesAgo: 11 },
    { orderId: "CLU-10480", netSales: 67.2, tipsCollected: 10.08, status: "DUPLICATE" as const, minutesAgo: 18 },
    { orderId: "CLU-10479", netSales: 19.5, tipsCollected: 2.93, status: "PROCESSED" as const, minutesAgo: 26 },
    { orderId: "CLU-10478", netSales: 54.0, tipsCollected: 8.1, status: "PROCESSED" as const, minutesAgo: 35 },
  ];
  for (const row of demoIngestions) {
    await prisma.posIngestionLog.create({
      data: {
        locationId: location.id,
        posOrderId: row.orderId,
        netSales: row.netSales,
        tipsCollected: row.tipsCollected,
        status: row.status,
        processedAt: new Date(now.getTime() - row.minutesAgo * 60 * 1000),
      },
    });
  }

  // Culture Constitution Bati — 5 valeurs Chatman (cohérence narrative).
  const cultureValues = [
    {
      valueKey: "VITESSE_SANS_CHAOS",
      sortOrder: 1,
      titleFr: "Vitesse sans chaos",
      titleEn: "Speed without chaos",
      titleEs: "Velocidad sin caos",
      behaviorFr:
        "Prioriser la cadence client sans jamais couper les coins ronds sur la sécurité CNESST.",
      behaviorEn: "Prioritize guest pace without ever cutting corners on CNESST safety.",
      behaviorEs: "Priorizar el ritmo del cliente sin recortar nunca la seguridad CNESST.",
    },
    {
      valueKey: "EQUIPE_DABORD",
      sortOrder: 2,
      titleFr: "L'équipe d'abord",
      titleEn: "Team first",
      titleEs: "El equipo primero",
      behaviorFr:
        "Prêter main-forte à la station voisine (ex. Emballage) avant de fermer sa propre zone au Comptoir.",
      behaviorEn: "Help the neighboring station (e.g. Packaging) before closing your own Counter zone.",
      behaviorEs: "Ayudar a la estación vecina (p. ej. Empaque) antes de cerrar tu propia zona de Mostrador.",
    },
    {
      valueKey: "FIABILITE_1TAP",
      sortOrder: 3,
      titleFr: "Fiabilité absolue",
      titleEn: "Absolute reliability",
      titleEs: "Fiabilidad absoluta",
      behaviorFr:
        "Ponctualité stricte au punch-in et communication immédiate via le flux 1-tap en cas de maladie.",
      behaviorEn: "Strict punctuality at clock-in and immediate 1-tap communication when sick.",
      behaviorEs: "Puntualidad estricta al fichar y comunicación inmediata 1-tap en caso de enfermedad.",
    },
    {
      valueKey: "PROPRETE_SECURITE",
      sortOrder: 4,
      titleFr: "Propreté & sécurité",
      titleEn: "Cleanliness & safety",
      titleEs: "Limpieza y seguridad",
      behaviorFr:
        "Signaler immédiatement un risque, maintenir la station propre, et ne jamais contourner une SOP sécurité.",
      behaviorEn: "Report risks immediately, keep the station clean, and never bypass a safety SOP.",
      behaviorEs: "Señalar riesgos de inmediato, mantener la estación limpia y nunca saltarse un SOP de seguridad.",
    },
    {
      valueKey: "RESPECT",
      sortOrder: 5,
      titleFr: "Respect",
      titleEn: "Respect",
      titleEs: "Respeto",
      behaviorFr:
        "Ton professionnel sous pression, feedback constructif, et inclusion de chaque équipier sur le plancher.",
      behaviorEn:
        "Professional tone under pressure, constructive feedback, and inclusion of every teammate on the floor.",
      behaviorEs:
        "Tono profesional bajo presión, feedback constructivo e inclusión de cada compañero en el piso.",
    },
  ];
  for (const val of cultureValues) {
    await prisma.organizationValue.upsert({
      where: {
        organizationId_valueKey: { organizationId: org.id, valueKey: val.valueKey },
      },
      update: val,
      create: { organizationId: org.id, ...val, isActive: true },
    });
  }

  // Pulse Survey — banque de 8 questions rotatives taguées aux valeurs Bati.
  const pulseBank = [
    {
      valueKey: "VITESSE_SANS_CHAOS",
      textFr: "Comment te sens-tu après ton quart aujourd'hui ?",
      textEn: "How do you feel after your shift today?",
      textEs: "¿Cómo te sientes después de tu turno de hoy?",
    },
    {
      valueKey: "VITESSE_SANS_CHAOS",
      textFr: "Le rythme de ta station était-il gérable cette semaine ?",
      textEn: "Was your station's pace manageable this week?",
      textEs: "¿El ritmo de tu estación fue manejable esta semana?",
    },
    {
      valueKey: "EQUIPE_DABORD",
      textFr: "Te sens-tu soutenu·e par ton équipe sur le plancher ?",
      textEn: "Do you feel supported by your team on the floor?",
      textEs: "¿Te sientes apoyado/a por tu equipo en el piso?",
    },
    {
      valueKey: "FIABILITE_1TAP",
      textFr: "Les outils (POS, prep, coms) t'ont-ils aidé·e cette semaine ?",
      textEn: "Did tools (POS, prep, comms) help you this week?",
      textEs: "¿Las herramientas (POS, prep, coms) te ayudaron esta semana?",
    },
    {
      valueKey: "EQUIPE_DABORD",
      textFr: "Recommanderais-tu de travailler ici à un ami cette semaine ?",
      textEn: "Would you recommend working here to a friend this week?",
      textEs: "¿Recomendarías trabajar aquí a un amigo esta semana?",
    },
    {
      valueKey: "RESPECT",
      textFr: "La communication avec la gestion a-t-elle été claire ?",
      textEn: "Was communication with management clear?",
      textEs: "¿Fue clara la comunicación con la gerencia?",
    },
    {
      valueKey: "PROPRETE_SECURITE",
      textFr: "As-tu eu le temps de faire ton travail correctement ?",
      textEn: "Did you have enough time to do your job properly?",
      textEs: "¿Tuviste tiempo suficiente para hacer bien tu trabajo?",
    },
    {
      valueKey: "EQUIPE_DABORD",
      textFr: "Le moral de ta station est-il bon en ce moment ?",
      textEn: "Is your station's morale good right now?",
      textEs: "¿Está bien la moral de tu estación en este momento?",
    },
  ];
  const pulseYear = new Date().getFullYear();
  let pulseSeeded = 0;
  for (let i = 0; i < pulseBank.length; i++) {
    const weekNumber = i + 1;
    const texts = pulseBank[i]!;
    await prisma.pulseQuestion.upsert({
      where: {
        organizationId_weekNumber_year: {
          organizationId: org.id,
          weekNumber,
          year: pulseYear,
        },
      },
      update: texts,
      create: {
        organizationId: org.id,
        weekNumber,
        year: pulseYear,
        ...texts,
        isActive: true,
      },
    });
    pulseSeeded += 1;
  }

  console.log("Seed Bati terminé:", {
    org: org.slug,
    location: location.name,
    owner: owner.email,
    channels: stationChannels.length + 1,
    hourlySalesProjections: 7 * 24,
    tipPool: true,
    formationModules: safetyModules.length + 1 + onboardingModules.length,
    onboardingDemo: { sam: employee.email, lea: nightEmployee.email },
    clusterPos: { externalId: CLUSTER_EXTERNAL_LOCATION_ID, demoHours: Object.keys(CLUSTER_DEMO_HOURS).length },
    autoPlanif: {
      staffPool: floorMembers.filter((m) => m.user.role === "EMPLOYEE").length,
      staffingProfiles: staffingDefaults.length,
    },
    pulseQuestions: pulseSeeded,
    cultureValues: cultureValues.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

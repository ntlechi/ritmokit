import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { canAccessManagerSettings } from "@/lib/auth/session";
import { getManagerOpsDashboard } from "@/lib/data/manager-ops-dashboard";
import { DEMO_BRAND, type DemoBrandKit } from "@/lib/demo/franchise-pitch";
import { getInfractionDefinition } from "@/lib/policy/workplace-convention";
import { prisma } from "@/lib/prisma";

export type TabletSnapshot = {
  day: number;
  locationId?: string;
  brand: DemoBrandKit;
  stats: {
    onFloor: number;
    formationsJ1: number;
    modulesCompleted: number;
    activeAlerts: number;
  };
  floorEmployees: {
    id: string;
    fullName: string;
    initials: string;
    role: string;
    station: string;
    pin: string;
    trainingPercent: number;
    status: "on_floor" | "late" | "onboarding_j1" | "off";
    hireDayOffset: number;
  }[];
  coaching: {
    employeeId: string;
    level: number;
    priority: "high" | "normal";
    body: string;
    script: string;
    primaryCta: string;
    secondaryCta: string;
    visibleFromDay: number;
    employee: {
      id: string;
      fullName: string;
      initials: string;
      role: string;
      station: string;
      pin: string;
      trainingPercent: number;
      status: "on_floor" | "late" | "onboarding_j1" | "off";
      hireDayOffset: number;
    };
  }[];
  formations: {
    employee: TabletSnapshot["floorEmployees"][number];
    modules: {
      id: string;
      title: string;
      unlockDay: number;
      estimatedMinutes: number;
      status: "done" | "active" | "locked";
    }[];
  }[];
  alerts: {
    id: string;
    tone: "danger" | "success" | "warn";
    title: string;
    body: string;
    minutesAgo: number;
    visibleFromDay: number;
  }[];
  coachingBanner: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function getLiveTabletSnapshot(
  userId: string,
  role: string,
  lang: Locale,
): Promise<TabletSnapshot | null> {
  if (!canAccessManagerSettings(role as Parameters<typeof canAccessManagerSettings>[0])) {
    return null;
  }

  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          organization: {
            select: { name: true, primaryColor: true, welcomeCopy: true, logoUrl: true, slug: true },
          },
        },
      },
    },
  });
  if (!membership) return null;

  const locationId = membership.locationId;
  const org = membership.location.organization;
  const ops = await getManagerOpsDashboard(userId, role, lang);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const orgId = membership.location.organizationId;
  const onboardingModuleFilter = {
    kind: "ONBOARDING" as const,
    isActive: true,
    OR: [{ locationId }, { locationId: null, organizationId: orgId }],
  };

  const [
    members,
    modules,
    discipline,
    lateShifts,
    recentSignatures,
    recentCompletions,
    progressRows,
    onFloorShifts,
  ] = await Promise.all([
    prisma.locationMember.findMany({
      where: { locationId, user: { role: "EMPLOYEE" } },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            createdAt: true,
            hrProfile: {
              select: {
                onboardingStatus: true,
                integrationStartedAt: true,
              },
            },
          },
        },
      },
      orderBy: { user: { fullName: "asc" } },
    }),
    prisma.formationModule.findMany({
      where: onboardingModuleFilter,
      orderBy: [{ unlockDay: "asc" }, { sortOrder: "asc" }],
      select: { id: true, title: true, unlockDay: true, estimatedMinutes: true },
    }),
    prisma.disciplinaryRecord.findMany({
      where: {
        locationId,
        occurredAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
        employeeSignedAt: null,
      },
      include: { employee: { select: { id: true, fullName: true } } },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
    prisma.shift.findMany({
      where: {
        locationId,
        employeeId: { not: null },
        startsAt: { gte: todayStart },
        actualStartsAt: { not: null },
      },
      include: {
        employee: { select: { id: true, fullName: true } },
        station: { select: { nameFr: true } },
      },
      take: 40,
    }),
    prisma.workplaceConventionSignature.findMany({
      where: { signedAt: { gte: todayStart }, user: { locationMembers: { some: { locationId } } } },
      include: { user: { select: { fullName: true } } },
      orderBy: { signedAt: "desc" },
      take: 5,
    }),
    prisma.employeeFormationProgress.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: todayStart },
        user: { locationMembers: { some: { locationId } } },
      },
      include: {
        user: { select: { id: true, fullName: true } },
        module: { select: { title: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 8,
    }),
    // Location-scoped so this can run in parallel with members/modules (no ID fan-out wait).
    prisma.employeeFormationProgress.findMany({
      where: {
        user: { locationMembers: { some: { locationId, user: { role: "EMPLOYEE" } } } },
        module: onboardingModuleFilter,
      },
      select: { userId: true, moduleId: true, status: true },
    }),
    prisma.shift.findMany({
      where: {
        locationId,
        employeeId: { not: null },
        OR: [
          { actualStartsAt: { not: null }, actualEndsAt: null },
          {
            startsAt: { lte: now },
            endsAt: { gt: now },
            status: { in: ["PUBLISHED", "PENDING_CONFIRMATION", "CONFIRMED"] },
          },
        ],
      },
      select: { employeeId: true },
    }),
  ]);

  const moduleIds = new Set(modules.map((m) => m.id));
  const progressByUser = new Map<string, Set<string>>();
  for (const row of progressRows) {
    if (row.status !== "COMPLETED" || !moduleIds.has(row.moduleId)) continue;
    const set = progressByUser.get(row.userId) ?? new Set();
    set.add(row.moduleId);
    progressByUser.set(row.userId, set);
  }

  const onFloorIds = new Set(
    onFloorShifts.map((s) => s.employeeId).filter((id): id is string => Boolean(id)),
  );

  const floorEmployees: TabletSnapshot["floorEmployees"] = members.map((m) => {
    const done = progressByUser.get(m.userId)?.size ?? 0;
    const trainingPercent =
      modules.length === 0 ? 0 : Math.round((done / modules.length) * 100);
    const late = lateShifts.some((s) => {
      if (s.employeeId !== m.userId || !s.actualStartsAt) return false;
      return s.actualStartsAt.getTime() - s.startsAt.getTime() > 10 * 60_000;
    });
    const onboarding =
      m.user.hrProfile?.onboardingStatus === "IN_PROGRESS" ||
      m.user.hrProfile?.onboardingStatus === "NOT_STARTED";
    let status: TabletSnapshot["floorEmployees"][number]["status"] = "off";
    if (late) status = "late";
    else if (onboarding && trainingPercent < 40) status = "onboarding_j1";
    else if (onFloorIds.has(m.userId)) status = "on_floor";

    return {
      id: m.userId,
      fullName: m.user.fullName,
      initials: initials(m.user.fullName),
      role: m.user.role,
      station: "—",
      pin: "",
      trainingPercent,
      status,
      hireDayOffset: 0,
    };
  });

  const formations: TabletSnapshot["formations"] = floorEmployees.map((emp) => {
    const doneSet = progressByUser.get(emp.id) ?? new Set();
    let foundActive = false;
    const moduleRows = modules.map((mod) => {
      if (doneSet.has(mod.id)) {
        return {
          id: mod.id,
          title: mod.title,
          unlockDay: mod.unlockDay,
          estimatedMinutes: mod.estimatedMinutes ?? 10,
          status: "done" as const,
        };
      }
      if (!foundActive) {
        foundActive = true;
        return {
          id: mod.id,
          title: mod.title,
          unlockDay: mod.unlockDay,
          estimatedMinutes: mod.estimatedMinutes ?? 10,
          status: "active" as const,
        };
      }
      return {
        id: mod.id,
        title: mod.title,
        unlockDay: mod.unlockDay,
        estimatedMinutes: mod.estimatedMinutes ?? 10,
        status: "locked" as const,
      };
    });
    return { employee: emp, modules: moduleRows };
  });

  const coaching: TabletSnapshot["coaching"] = discipline.map((d) => {
    let script = d.managerScript || "Documenter les faits et faire le coaching verbal.";
    try {
      const def = getInfractionDefinition(d.infractionCode as never);
      script = d.managerScript || def.managerScripts[lang]?.[0] || script;
    } catch {
      /* unknown code — keep fallback */
    }
    const emp =
      floorEmployees.find((e) => e.id === d.employeeId) ??
      ({
        id: d.employeeId,
        fullName: d.employee.fullName,
        initials: initials(d.employee.fullName),
        role: "EMPLOYEE",
        station: "—",
        pin: "",
        trainingPercent: 0,
        status: "on_floor" as const,
        hireDayOffset: 0,
      } satisfies TabletSnapshot["floorEmployees"][number]);

    return {
      employeeId: d.employeeId,
      level: d.disciplineStep === "VERBAL_COACHING" ? 1 : 2,
      priority: d.disciplineStep === "VERBAL_COACHING" ? ("high" as const) : ("normal" as const),
      body: d.facts,
      script,
      primaryCta: "Faire le coaching",
      secondaryCta: "Reporter",
      visibleFromDay: 1,
      employee: emp,
    };
  });

  const alerts: TabletSnapshot["alerts"] = [];

  for (const s of lateShifts) {
    if (!s.employee || !s.actualStartsAt) continue;
    const lateMin = Math.round((s.actualStartsAt.getTime() - s.startsAt.getTime()) / 60_000);
    if (lateMin < 10) continue;
    alerts.push({
      id: `late-${s.id}`,
      tone: "danger",
      title: `${s.employee.fullName} — retard`,
      body: `${lateMin} min de retard · ${s.station.nameFr}. Coaching documenté recommandé.`,
      minutesAgo: Math.max(1, Math.round((now.getTime() - s.actualStartsAt.getTime()) / 60_000)),
      visibleFromDay: 1,
    });
  }

  for (const sig of recentSignatures) {
    alerts.push({
      id: `sig-${sig.id}`,
      tone: "success",
      title: `${sig.user.fullName} — convention signée`,
      body: "Signature numérique confirmée.",
      minutesAgo: Math.max(1, Math.round((now.getTime() - sig.signedAt.getTime()) / 60_000)),
      visibleFromDay: 1,
    });
  }

  for (const c of recentCompletions) {
    alerts.push({
      id: `mod-${c.id}`,
      tone: "success",
      title: `${c.user.fullName} — ${c.module.title}`,
      body: "Module de formation complété.",
      minutesAgo: Math.max(
        1,
        Math.round((now.getTime() - (c.completedAt?.getTime() ?? now.getTime())) / 60_000),
      ),
      visibleFromDay: 1,
    });
  }

  const formationsJ1 = floorEmployees.filter((e) => e.status === "onboarding_j1").length;
  const modulesCompleted = floorEmployees.reduce(
    (acc, e) => acc + Math.floor(e.trainingPercent / Math.max(1, Math.round(100 / Math.max(modules.length, 1)))),
    0,
  );
  const activeAlerts = alerts.filter((a) => a.tone === "danger" || a.tone === "warn").length;
  const highCoach = coaching.find((c) => c.priority === "high");

  const brand: DemoBrandKit = {
    name: org.name,
    slug: org.slug,
    logoMark: (org.name[0] ?? "M").toUpperCase(),
    primaryColor: org.primaryColor || DEMO_BRAND.primaryColor,
    welcomeCopy: org.welcomeCopy || DEMO_BRAND.welcomeCopy,
    rewardMessage: DEMO_BRAND.rewardMessage,
    managerMessageWeek1: DEMO_BRAND.managerMessageWeek1,
  };

  return {
    day: 0,
    locationId,
    brand,
    stats: {
      onFloor: ops?.onFloorTotal ?? onFloorIds.size,
      formationsJ1,
      modulesCompleted,
      activeAlerts,
    },
    floorEmployees,
    coaching,
    formations,
    alerts: alerts.slice(0, 12),
    coachingBanner: highCoach
      ? `${highCoach.employee.fullName} — coaching requis avant le prochain quart`
      : null,
  };
}

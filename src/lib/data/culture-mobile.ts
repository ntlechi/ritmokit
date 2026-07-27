import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";
import { getPulseWeekBounds, getPulseWeekParts } from "@/lib/pulse/week";

export type MobileCultureFace = {
  userId: string;
  fullName: string;
  firstName: string;
  profilePictureUrl: string | null;
};

export type MobileCultureCardData = {
  valueKey: string;
  title: string;
  behavior: string;
  weekNumber: number;
  year: number;
  totalShoutOutsCount: number;
  faces: MobileCultureFace[];
  extraCount: number;
};

function pickLocale(
  row: {
    titleFr: string;
    titleEn: string;
    titleEs: string;
    behaviorFr: string;
    behaviorEn: string;
    behaviorEs: string;
  },
  lang: Locale,
): { title: string; behavior: string } {
  if (lang === "en") return { title: row.titleEn, behavior: row.behaviorEn };
  if (lang === "es") return { title: row.titleEs, behavior: row.behaviorEs };
  return { title: row.titleFr, behavior: row.behaviorFr };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Carte Culture mobile — valeur de la semaine (Pulse ISO) + preuve sociale
 * (shout-outs tagués + avatars des receivers distincts).
 */
export async function getMobileCultureCardData(
  userId: string,
  lang: Locale,
): Promise<MobileCultureCardData | null> {
  const membership = await prisma.locationMember.findFirst({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      location: { select: { id: true, organizationId: true } },
    },
  });
  if (!membership) return null;

  const locationId = membership.location.id;
  const organizationId = membership.location.organizationId;
  const { weekNumber, year } = getPulseWeekParts();
  const { start, end } = getPulseWeekBounds();

  const activeQuestion = await prisma.pulseQuestion.findUnique({
    where: {
      organizationId_weekNumber_year: { organizationId, weekNumber, year },
    },
    select: { valueKey: true },
  });

  // Fallback : première valeur active de la constitution si Pulse non tagué.
  let valueKey = activeQuestion?.valueKey ?? null;
  if (!valueKey) {
    const fallback = await prisma.organizationValue.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { valueKey: true },
    });
    valueKey = fallback?.valueKey ?? null;
  }
  if (!valueKey) return null;

  const cultureValue = await prisma.organizationValue.findUnique({
    where: { organizationId_valueKey: { organizationId, valueKey } },
  });
  if (!cultureValue || !cultureValue.isActive) return null;

  const [weeklyShoutOuts, totalShoutOutsCount] = await Promise.all([
    prisma.stationShoutOut.findMany({
      where: {
        locationId,
        valueKey,
        createdAt: { gte: start, lt: end },
      },
      select: {
        receiverId: true,
        createdAt: true,
        receiver: {
          select: {
            id: true,
            fullName: true,
            profilePictureUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.stationShoutOut.count({
      where: {
        locationId,
        valueKey,
        createdAt: { gte: start, lt: end },
      },
    }),
  ]);

  // Receivers distincts, ordre = plus récent d'abord.
  const seen = new Set<string>();
  const faces: MobileCultureFace[] = [];
  for (const row of weeklyShoutOuts) {
    if (seen.has(row.receiverId)) continue;
    seen.add(row.receiverId);
    faces.push({
      userId: row.receiver.id,
      fullName: row.receiver.fullName,
      firstName: firstName(row.receiver.fullName),
      profilePictureUrl: row.receiver.profilePictureUrl,
    });
    if (faces.length >= 5) break;
  }

  const displayFaces = faces.slice(0, 3);
  const extraCount = Math.max(0, faces.length - displayFaces.length);

  const picked = pickLocale(cultureValue, lang);

  return {
    valueKey,
    title: picked.title,
    behavior: picked.behavior,
    weekNumber,
    year,
    totalShoutOutsCount,
    faces: displayFaces,
    extraCount,
  };
}

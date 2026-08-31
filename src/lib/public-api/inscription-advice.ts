import "server-only";

import {
  adviseInscription,
  type AdvisorQuery,
  type AdvisorResult,
} from "@/lib/dance/inscription-advisor";
import { getPublicSchedule } from "@/lib/public-api/schedule";
import { resolvePublicLocation } from "@/lib/public-api/tenant";
import type { CourseLevel } from "@/generated/prisma/enums";

export type InscriptionAdviceInput = AdvisorQuery & {
  locationId?: string | null;
  locationSlug?: string | null;
  organizationSlug?: string | null;
  level?: CourseLevel | null;
};

export async function getInscriptionAdvice(
  input: InscriptionAdviceInput,
): Promise<
  | { ok: true; locationId: string; locationName: string; advice: AdvisorResult }
  | { ok: false; error: string; status: number }
> {
  const location = await resolvePublicLocation({
    locationId: input.locationId,
    locationSlug: input.locationSlug,
    organizationSlug: input.organizationSlug,
  });
  if (!location) return { ok: false, error: "location_not_found", status: 404 };

  const schedule = await getPublicSchedule({
    locationId: location.id,
    level: input.level,
    dayOfWeek: null,
  });

  const advice = adviseInscription(
    schedule.classes.map((cls) => ({
      id: cls.id,
      title: cls.title,
      style: cls.style,
      level: cls.level,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      capacity: {
        maxLeads: cls.capacity.maxLeads,
        maxFollows: cls.capacity.maxFollows,
        filledLeads: cls.capacity.leadsFilled,
        filledFollows: cls.capacity.followsFilled,
      },
    })),
    {
      role: input.role,
      style: input.style,
      level: input.level,
      dayOfWeek: input.dayOfWeek,
      withPartner: input.withPartner,
    },
  );

  return {
    ok: true,
    locationId: location.id,
    locationName: location.name,
    advice,
  };
}

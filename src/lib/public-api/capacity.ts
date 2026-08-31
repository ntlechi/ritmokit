import "server-only";

import {
  evaluateCoupleEnrollment,
  evaluateParityEnrollment,
  getClassAvailability,
  type RoleCapacity,
} from "@/lib/dance/parity";
import { prisma } from "@/lib/prisma";
import type { DanceRole } from "@/generated/prisma/enums";

export async function loadSessionCapacity(sessionId: string): Promise<RoleCapacity | null> {
  const session = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: {
      maxLeads: true,
      maxFollows: true,
      enrollments: {
        where: {
          waitlisted: false,
          paymentStatus: { not: "CANCELLED_INTERAC" },
        },
        select: { danceRole: true },
      },
    },
  });
  if (!session) return null;

  let filledLeads = 0;
  let filledFollows = 0;
  for (const e of session.enrollments) {
    if (e.danceRole === "LEAD") filledLeads += 1;
    else if (e.danceRole === "FOLLOW") filledFollows += 1;
  }

  return {
    maxLeads: session.maxLeads,
    maxFollows: session.maxFollows,
    filledLeads,
    filledFollows,
  };
}

export function roleRegistrationFlags(cap: RoleCapacity, role: DanceRole) {
  const immediate = evaluateParityEnrollment(cap, role, { allowWaitlist: false });
  const withWaitlist = evaluateParityEnrollment(cap, role, { allowWaitlist: true });
  return {
    canRegister: immediate.ok && !immediate.waitlisted,
    canWaitlist: Boolean(withWaitlist.ok && withWaitlist.waitlisted),
  };
}

export function buildAvailabilityPayload(cap: RoleCapacity) {
  const availability = getClassAvailability(cap);
  const lead = roleRegistrationFlags(cap, "LEAD");
  const follow = roleRegistrationFlags(cap, "FOLLOW");
  const solo = roleRegistrationFlags(cap, "SOLO");
  const couple = evaluateCoupleEnrollment(cap);

  return {
    leadsFilled: availability.leadsFilled,
    followsFilled: availability.followsFilled,
    maxLeads: availability.maxLeads,
    maxFollows: availability.maxFollows,
    leadsFree: availability.leadsFree,
    followsFree: availability.followsFree,
    imbalance: availability.imbalance,
    full: availability.full,
    canRegisterLead: lead.canRegister,
    canRegisterFollow: follow.canRegister,
    canRegisterSolo: solo.canRegister,
    canWaitlistLead: lead.canWaitlist,
    canWaitlistFollow: follow.canWaitlist,
    canWaitlistSolo: solo.canWaitlist,
    canRegisterCouple: couple.ok && !couple.waitlisted,
    waitlistActive: lead.canWaitlist || follow.canWaitlist || solo.canWaitlist,
  };
}

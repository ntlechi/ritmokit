import {
  evaluateCoupleEnrollment,
  evaluateParityEnrollment,
  type RoleCapacity,
} from "@/lib/dance/parity";

export type AdvisorClass = {
  id: string;
  title: string;
  style: string;
  level: string;
  dayOfWeek: number | null;
  startTime: string;
  capacity: RoleCapacity;
};

export type AdvisorQuery = {
  role: "LEAD" | "FOLLOW";
  style?: string | null;
  level?: string | null;
  dayOfWeek?: number | null;
  withPartner?: boolean;
};

export type AdvisorVerdict =
  | "confirmed"
  | "alternate"
  | "partner_unlocks"
  | "waitlist"
  | "no_match";

export type AdvisorOfferStatus = "confirmed" | "waitlist" | "partner_confirmed";

export type AdvisorOffer = {
  sessionId: string;
  title: string;
  style: string;
  level: string;
  dayOfWeek: number | null;
  startTime: string;
  status: AdvisorOfferStatus;
  leadsFree: number;
  followsFree: number;
  reason: "role_open" | "imbalance_waitlist" | "role_full" | "partner_balances";
};

export type AdvisorResult = {
  verdict: AdvisorVerdict;
  headlineKey: AdvisorVerdict;
  offers: AdvisorOffer[];
};

function norm(value: string) {
  return value.trim().toLowerCase();
}

function matchesFilter(cls: AdvisorClass, query: AdvisorQuery): boolean {
  if (query.style) {
    const needle = norm(query.style);
    if (!norm(cls.style).includes(needle) && !norm(cls.title).includes(needle)) {
      return false;
    }
  }
  if (query.level && norm(cls.level) !== norm(query.level)) return false;
  return true;
}

function scoreOffer(offer: AdvisorOffer, query: AdvisorQuery): number {
  let score = 0;
  if (offer.status === "confirmed") score += 100;
  if (offer.status === "partner_confirmed") score += 80;
  if (offer.status === "waitlist") score += 20;
  if (query.dayOfWeek != null && offer.dayOfWeek === query.dayOfWeek) score += 15;
  if (offer.reason === "partner_balances") score += 5;
  return score;
}

function offerForClass(cls: AdvisorClass, query: AdvisorQuery): AdvisorOffer | null {
  const solo = evaluateParityEnrollment(cls.capacity, query.role, { allowWaitlist: true });
  const couple = query.withPartner ? evaluateCoupleEnrollment(cls.capacity) : null;

  if (couple?.ok && !couple.waitlisted) {
    const soloOpen = solo.ok && !solo.waitlisted;
    return {
      sessionId: cls.id,
      title: cls.title,
      style: cls.style,
      level: cls.level,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      status: soloOpen ? "confirmed" : "partner_confirmed",
      leadsFree: Math.max(0, cls.capacity.maxLeads - cls.capacity.filledLeads),
      followsFree: Math.max(0, cls.capacity.maxFollows - cls.capacity.filledFollows),
      reason: soloOpen ? "role_open" : "partner_balances",
    };
  }

  if (solo.ok && !solo.waitlisted) {
    return {
      sessionId: cls.id,
      title: cls.title,
      style: cls.style,
      level: cls.level,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      status: "confirmed",
      leadsFree: Math.max(0, cls.capacity.maxLeads - cls.capacity.filledLeads),
      followsFree: Math.max(0, cls.capacity.maxFollows - cls.capacity.filledFollows),
      reason: "role_open",
    };
  }

  if (solo.ok && solo.waitlisted) {
    return {
      sessionId: cls.id,
      title: cls.title,
      style: cls.style,
      level: cls.level,
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      status: "waitlist",
      leadsFree: Math.max(0, cls.capacity.maxLeads - cls.capacity.filledLeads),
      followsFree: Math.max(0, cls.capacity.maxFollows - cls.capacity.filledFollows),
      reason: solo.reason === "imbalance" ? "imbalance_waitlist" : "role_full",
    };
  }

  return null;
}

export function adviseInscription(classes: AdvisorClass[], query: AdvisorQuery): AdvisorResult {
  const candidates = classes.filter((cls) => matchesFilter(cls, query));
  const offers = candidates
    .map((cls) => offerForClass(cls, query))
    .filter((row): row is AdvisorOffer => row != null)
    .sort((a, b) => scoreOffer(b, query) - scoreOffer(a, query))
    .slice(0, 6);

  const requestedDay = query.dayOfWeek;
  const confirmedOnDay = offers.find(
    (o) => o.status === "confirmed" && (requestedDay == null || o.dayOfWeek === requestedDay),
  );
  const confirmedAny = offers.find((o) => o.status === "confirmed");
  const partner = offers.find((o) => o.status === "partner_confirmed");
  const waitlist = offers.find((o) => o.status === "waitlist");

  let verdict: AdvisorVerdict = "no_match";
  if (confirmedOnDay) verdict = "confirmed";
  else if (confirmedAny) verdict = "alternate";
  else if (partner) verdict = "partner_unlocks";
  else if (waitlist) verdict = "waitlist";

  return { verdict, headlineKey: verdict, offers };
}

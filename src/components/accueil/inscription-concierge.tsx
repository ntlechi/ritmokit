"use client";

import { useState, useTransition } from "react";
import { adviseInscriptionAction } from "@/lib/actions/inscription-advice";
import type { AdvisorOffer, AdvisorVerdict } from "@/lib/dance/inscription-advisor";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

function headline(dict: Dictionary, verdict: AdvisorVerdict) {
  return dict.accueil.conciergeVerdict[verdict];
}

function offerStatus(dict: Dictionary, status: AdvisorOffer["status"]) {
  if (status === "partner_confirmed") return dict.accueil.conciergePartner;
  if (status === "waitlist") return dict.accueil.conciergeWaitlist;
  return dict.accueil.conciergeConfirmed;
}

function dayLabel(dict: Dictionary, day: number | null) {
  if (day == null) return "—";
  return dict.availability.days[day] ?? String(day);
}

export function InscriptionConcierge({
  locationId,
  dict,
}: {
  locationId: string;
  dict: Dictionary;
}) {
  const [role, setRole] = useState<"LEAD" | "FOLLOW">("FOLLOW");
  const [style, setStyle] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | "">("");
  const [withPartner, setWithPartner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<AdvisorVerdict | null>(null);
  const [offers, setOffers] = useState<AdvisorOffer[]>([]);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await adviseInscriptionAction({
        locationId,
        role,
        style,
        dayOfWeek: dayOfWeek === "" ? null : dayOfWeek,
        withPartner,
      });
      if (!result.ok) {
        setVerdict(null);
        setOffers([]);
        setError(dict.accueil.conciergeError);
        return;
      }
      setVerdict(result.advice.verdict);
      setOffers(result.advice.offers);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
      <p className="text-sm font-semibold tracking-tight">{dict.accueil.conciergeTitle}</p>
      <p className="mt-1 text-xs text-foreground-muted">{dict.accueil.conciergeSubtitle}</p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(["FOLLOW", "LEAD"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-interactive
              onClick={() => setRole(value)}
              aria-pressed={role === value}
              className={cn(
                "px-3 py-1.5 text-sm font-medium",
                role === value ? dna.pillActive : dna.pillIdle,
              )}
            >
              {value === "LEAD" ? dict.accueil.leads : dict.accueil.follows}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 px-2 text-sm">
            <input
              type="checkbox"
              checked={withPartner}
              onChange={(event) => setWithPartner(event.target.checked)}
            />
            {dict.accueil.conciergeWithPartner}
          </label>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            placeholder={dict.accueil.conciergeStyle}
            className={cn(dna.field, "h-10 flex-1")}
          />
          <select
            value={dayOfWeek === "" ? "" : String(dayOfWeek)}
            onChange={(event) =>
              setDayOfWeek(event.target.value === "" ? "" : Number(event.target.value))
            }
            aria-label={dict.accueil.conciergeDay}
            className={cn(dna.field, "h-10 sm:w-44")}
          >
            <option value="">{dict.accueil.conciergeAnyDay}</option>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {dayLabel(dict, day)}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className={cn(dna.cta, "h-10 shrink-0")}>
            {pending ? dict.common.loading : dict.accueil.conciergeAsk}
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {verdict && (
        <p className="mt-3 text-sm font-medium text-foreground">{headline(dict, verdict)}</p>
      )}
      {offers.length > 0 && (
        <ul className="mt-2 divide-y divide-border-subtle">
          {offers.map((offer) => (
            <li key={offer.sessionId} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{offer.title}</p>
                <p className="text-xs text-foreground-muted">
                  {dayLabel(dict, offer.dayOfWeek)} · {offer.startTime} · {offer.style}
                </p>
              </div>
              <p className="text-xs font-semibold text-accent">{offerStatus(dict, offer.status)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

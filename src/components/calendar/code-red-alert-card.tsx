"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Siren } from "lucide-react";
import {
  acceptCodeRedShiftAction,
  declineCodeRedShiftAction,
  type CodeRedOffer,
} from "@/lib/actions/code-red";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { formatTimeRange } from "@/lib/calendar/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function stationName(offer: CodeRedOffer, lang: Locale) {
  if (lang === "en") return offer.stationNameEn;
  if (lang === "es") return offer.stationNameEs;
  return offer.stationNameFr;
}

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.schedule.codeRed.errors.unauthorized,
    database_error: dict.schedule.codeRed.errors.databaseError,
    shift_not_found: dict.schedule.codeRed.errors.shiftNotFound,
    not_code_red: dict.schedule.codeRed.errors.notCodeRed,
    already_taken: dict.schedule.codeRed.errors.alreadyTaken,
    no_pending_bid: dict.schedule.codeRed.errors.noPendingBid,
    no_longer_eligible: dict.schedule.codeRed.errors.noLongerEligible,
  };
  return map[code] ?? dict.schedule.codeRed.errors.databaseError;
}

export function CodeRedAlertCard({
  offer,
  dict,
  lang,
}: {
  offer: CodeRedOffer;
  dict: Dictionary;
  lang: Locale;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"claimed" | "declined" | null>(null);
  const [isPending, startTransition] = useTransition();

  if (done === "declined") return null;

  const startsAt = new Date(offer.startsAt);
  const endsAt = new Date(offer.endsAt);
  const name = stationName(offer, lang);

  function claim() {
    setError(null);
    startTransition(async () => {
      const result = await acceptCodeRedShiftAction(offer.shiftId);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        if (result.error === "already_taken") setDone("claimed");
        return;
      }
      setDone("claimed");
      router.refresh();
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const result = await declineCodeRedShiftAction(offer.shiftId);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setDone("declined");
      router.refresh();
    });
  }

  return (
    <section
      className={cn(
        "shimmer-overlay animate-fade-up relative overflow-hidden rounded-2xl border border-danger/40 p-5",
        "bg-gradient-to-br from-danger/15 via-surface to-warning/10",
        "shadow-[0_0_0_1px_rgb(220_38_38/0.2),0_8px_32px_rgb(220_38_38/0.18)]",
      )}
      style={{
        boxShadow: `0 0 0 1px color-mix(in srgb, ${offer.stationColorHex} 25%, transparent), 0 8px 32px color-mix(in srgb, ${offer.stationColorHex} 20%, transparent)`,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: offer.stationColorHex }}
        aria-hidden
      />

      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white animate-pulse-soft">
          <Siren className="h-3 w-3" aria-hidden />
          {dict.schedule.codeRed.badge}
        </span>
        {offer.surgeBonus != null && offer.surgeBonus > 0 && (
          <span className="font-mono text-sm font-bold tabular-nums text-danger">
            +{offer.surgeBonus.toFixed(2)} $/h
          </span>
        )}
      </div>

      {done === "claimed" ? (
        <p className="mt-4 text-sm font-semibold text-success">{dict.schedule.codeRed.claimedSuccess}</p>
      ) : (
        <>
          <h3 className="mt-3 text-lg font-bold tracking-tight">
            {dict.schedule.codeRed.offerTitle.replace("{station}", name)}
          </h3>
          <p className="mt-1 text-sm text-foreground-muted">
            {formatTimeRange(startsAt, endsAt, lang)}
          </p>
          <p className="mt-1 text-xs text-foreground-muted">{dict.schedule.codeRed.offerSubtitle}</p>

          {error && (
            <p className="mt-3 text-sm text-danger">
              {error === dict.schedule.codeRed.errors.alreadyTaken
                ? dict.schedule.codeRed.alreadyTaken
                : error}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="danger"
              size="md"
              className="w-full font-bold shadow-[0_0_20px_rgb(220_38_38/0.35)]"
              disabled={isPending}
              onClick={claim}
            >
              {isPending ? dict.schedule.codeRed.claiming : dict.schedule.codeRed.claimButton}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-foreground-muted"
              disabled={isPending}
              onClick={decline}
            >
              {dict.schedule.codeRed.declineButton}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export function CodeRedOffersStack({
  offers,
  dict,
  lang,
}: {
  offers: CodeRedOffer[];
  dict: Dictionary;
  lang: Locale;
}) {
  if (offers.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {offers.map((offer) => (
        <CodeRedAlertCard key={offer.bidId} offer={offer} dict={dict} lang={lang} />
      ))}
    </div>
  );
}

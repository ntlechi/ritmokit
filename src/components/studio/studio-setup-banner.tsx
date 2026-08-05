"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Printer, X } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { StudioSetupStatus } from "@/lib/data/studio-setup";
import { STUDIO_SETUP_STEP_IDS } from "@/lib/data/studio-setup";
import {
  dismissStudioSetupBanner,
  isAccueilStepMarked,
  isStudioSetupBannerDismissed,
} from "@/lib/studio-setup/client";
import { dna } from "@/lib/design/dna";

function stepCopy(dict: Dictionary, id: (typeof STUDIO_SETUP_STEP_IDS)[number]) {
  return dict.help.studioSetup.steps[id];
}

export function StudioSetupBanner({
  dict,
  lang,
  status,
}: {
  dict: Dictionary;
  lang: Locale;
  status: StudioSetupStatus;
}) {
  const [dismissed, setDismissed] = useState(true);
  const [accueilDone, setAccueilDone] = useState(false);

  useEffect(() => {
    setDismissed(isStudioSetupBannerDismissed());
    setAccueilDone(isAccueilStepMarked());
  }, []);

  const allComplete = status.serverComplete && accueilDone;
  if (allComplete || dismissed) return null;

  const nextStep = STUDIO_SETUP_STEP_IDS.find((id) => {
    if (id === "accueil") return !accueilDone;
    return !status.steps[id];
  });
  const nextCopy = nextStep ? stepCopy(dict, nextStep) : null;

  return (
    <section className="rounded-2xl border-2 border-accent/30 bg-accent/5 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
            {dict.help.studioSetup.bannerEyebrow}
          </p>
          <p className="mt-1 text-sm font-bold">{dict.help.studioSetup.bannerTitle}</p>
          <p className="mt-1 text-sm text-foreground-muted">
            {dict.help.studioSetup.bannerSubtitle
              .replace("{done}", String(status.serverDoneCount))
              .replace("{total}", String(status.serverTotal))}
          </p>
          {nextCopy && (
            <p className="mt-2 text-[13px]">
              <span className="text-foreground-muted">{dict.help.studioSetup.bannerNext} </span>
              <span className="font-semibold">{nextCopy.title}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            dismissStudioSetupBanner();
            setDismissed(true);
          }}
          className={dna.iconBtn}
          aria-label={dict.help.studioSetup.dismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/${lang}/settings/manager/setup`} className={dna.cta}>
          {dict.help.studioSetup.continue}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          href={`/${lang}/help/feuille-accueil`}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-semibold"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          {dict.help.studioSetup.printSheet}
        </Link>
      </div>
    </section>
  );
}

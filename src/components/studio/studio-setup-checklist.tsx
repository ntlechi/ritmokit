"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Circle, Printer } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { StudioSetupStatus, StudioSetupStepId } from "@/lib/studio-setup/types";
import { STUDIO_SETUP_STEP_IDS } from "@/lib/studio-setup/types";
import {
  isAccueilStepMarked,
  markAccueilStepTried,
} from "@/lib/studio-setup/client";
import { cn } from "@/lib/utils";

type StepHref = (lang: Locale) => string;

const STEP_HREFS: Record<StudioSetupStepId, StepHref> = {
  paypal: (lang) => `/${lang}/settings/manager/integrations`,
  season: (lang) => `/${lang}/sessions`,
  classes: (lang) => `/${lang}/sessions`,
  accueil: (lang) => `/${lang}/accueil`,
};

function stepCopy(dict: Dictionary, id: StudioSetupStepId) {
  return dict.help.studioSetup.steps[id];
}

export function StudioSetupChecklist({
  dict,
  lang,
  status,
  variant = "card",
  onAccueilMarked,
}: {
  dict: Dictionary;
  lang: Locale;
  status: StudioSetupStatus;
  variant?: "card" | "plain";
  onAccueilMarked?: () => void;
}) {
  const [accueilDone, setAccueilDone] = useState(false);

  useEffect(() => {
    setAccueilDone(isAccueilStepMarked());
  }, []);

  const steps = STUDIO_SETUP_STEP_IDS.map((id) => ({
    id,
    done: id === "accueil" ? accueilDone || status.steps.accueil : status.steps[id],
    href: STEP_HREFS[id](lang),
    copy: stepCopy(dict, id),
  }));

  const doneCount = steps.filter((s) => s.done).length;

  function handleMarkAccueil() {
    markAccueilStepTried();
    setAccueilDone(true);
    onAccueilMarked?.();
  }

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold tracking-tight">{dict.help.studioSetup.title}</h2>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground-muted">
          {dict.help.studioSetup.progress
            .replace("{done}", String(doneCount))
            .replace("{total}", String(steps.length))}
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground-muted">{dict.help.studioSetup.subtitle}</p>

      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3",
              step.done ? "border-success/25 bg-success/5" : "border-border bg-surface",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                step.done ? "bg-success text-white" : "bg-surface-muted text-foreground-muted",
              )}
              aria-hidden
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[11px] font-bold">{index + 1}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{step.copy.title}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-foreground-muted">{step.copy.description}</p>
              {!step.done && step.id === "accueil" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={step.href}
                    className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-foreground"
                  >
                    {step.copy.cta}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={handleMarkAccueil}
                    className="rounded-full border border-border px-3 py-1 text-[11px] font-medium hover:bg-surface-muted"
                  >
                    {dict.help.studioSetup.markAccueilTried}
                  </button>
                </div>
              ) : !step.done ? (
                <Link
                  href={step.href}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                >
                  {step.copy.cta}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/${lang}/help/feuille-accueil`}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-semibold hover:bg-surface-muted"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          {dict.help.studioSetup.printSheet}
        </Link>
        <Link
          href={`/${lang}/help/gettingStarted`}
          className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-[12px] font-semibold text-foreground-muted hover:text-foreground"
        >
          {dict.help.openGuide}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </>
  );

  if (variant === "plain") return body;

  return <section className="premium-card p-5 sm:p-6">{body}</section>;
}

/** Compact progress pill for settings hub. */
export function StudioSetupHubPill({
  dict,
  lang,
  status,
}: {
  dict: Dictionary;
  lang: Locale;
  status: StudioSetupStatus;
}) {
  const done = status.serverDoneCount;
  const total = status.serverTotal;

  if (done === total) return null;

  return (
    <Link
      href={`/${lang}/settings/manager/setup`}
      className="flex items-center gap-3 rounded-2xl border-2 border-accent/35 bg-accent/10 px-5 py-4 transition hover:bg-accent/15"
    >
      <Circle className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{dict.help.studioSetup.hubPillTitle}</span>
        <span className="mt-0.5 block text-xs text-foreground-muted">
          {dict.help.studioSetup.progress.replace("{done}", String(done)).replace("{total}", String(total))}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-accent" aria-hidden />
    </Link>
  );
}

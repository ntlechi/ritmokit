"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { completeFormationModuleAction } from "@/lib/actions/training";
import { VideoEmbed } from "@/components/training/video-embed";
import { parseVideoUrl } from "@/lib/training/video";
import type { FormationModuleDetail } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { stationLabel } from "@/lib/stations/display";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.training.errors.unauthorized,
    module_not_found: dict.training.errors.moduleNotFound,
    invalid_signature: dict.training.errors.invalidSignature,
    already_completed: dict.training.errors.alreadyCompleted,
    database_error: dict.training.errors.databaseError,
  };
  return map[code] ?? dict.training.errors.databaseError;
}

export function TrainingFlashcardPlayer({
  lang,
  dict,
  module,
  defaultSignature = "",
}: {
  lang: Locale;
  dict: Dictionary;
  module: FormationModuleDetail;
  defaultSignature?: string;
}) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [signature, setSignature] = useState(defaultSignature);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(module.status === "COMPLETED");
  const [isPending, startTransition] = useTransition();

  const steps = module.steps;
  const hasSteps = steps.length > 0;
  const videoId = module.videoUrl && parseVideoUrl(module.videoUrl) ? module.videoUrl : null;
  const onIntro = !hasSteps || stepIndex === 0;
  const currentStep = hasSteps && stepIndex > 0 ? steps[stepIndex - 1] : null;
  const atLastStep = hasSteps ? stepIndex === steps.length : true;
  const showAttestation = atLastStep && !completed;

  const progressPercent = useMemo(() => {
    if (completed) return 100;
    if (!hasSteps) return 50;
    return Math.round((stepIndex / steps.length) * 100);
  }, [completed, hasSteps, stepIndex, steps.length]);

  function goNext() {
    setError(null);
    if (!hasSteps || stepIndex >= steps.length) return;
    setStepIndex((value) => value + 1);
  }

  function goBack() {
    setError(null);
    if (stepIndex <= 0) return;
    setStepIndex((value) => value - 1);
  }

  function submitCompletion() {
    setError(null);
    startTransition(async () => {
      const result = await completeFormationModuleAction(module.id, signature);
      if (!result.ok) {
        setError(resolveError(dict, result.error));
        return;
      }
      setCompleted(true);
      router.refresh();
    });
  }

  if (completed) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        <Link
          href={`/${lang}/sops`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {dict.training.backToList}
        </Link>
        <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-success/30 bg-success/5 p-8 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
            <Check className="h-7 w-7 text-success" aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">{dict.training.completedTitle}</h1>
          <p className="mt-2 text-sm text-foreground-muted">{module.title}</p>
          {module.signatureName && (
            <p className="mt-4 text-xs text-foreground-muted">
              {dict.training.signedAs.replace("{name}", module.signatureName)}
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <Link
        href={`/${lang}/sops`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {dict.training.backToList}
      </Link>

      <div className="mb-4 h-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {dict.training.kind[module.kind]}
        {module.station
          ? ` · ${stationLabel(module.station, lang)}`
          : ` · ${dict.team.allStations}`}
      </p>

      <section className="flex min-h-[420px] flex-1 flex-col rounded-3xl border border-border bg-surface p-6 shadow-sm">
        {onIntro ? (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <Shield className="h-5 w-5 text-accent" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">{module.title}</h1>
            {module.summary && <p className="mt-2 text-sm text-foreground-muted">{module.summary}</p>}
            {videoId && (
              <div className="mt-4">
                <VideoEmbed url={videoId} title={module.title} />
              </div>
            )}
            <div className="mt-4 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
              {module.body}
            </div>
          </>
        ) : currentStep ? (
          <>
            <p className="text-xs font-medium text-foreground-muted">
              {dict.training.stepOf
                .replace("{current}", String(stepIndex))
                .replace("{total}", String(steps.length))}
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{currentStep.title}</h2>
            <p className="mt-4 flex-1 text-base leading-relaxed text-foreground-muted">{currentStep.body}</p>
          </>
        ) : null}

        {showAttestation && module.requiresSignature && (
          <div className="mt-6 border-t border-border pt-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground-muted">{dict.training.signatureLabel}</span>
              <input
                type="text"
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder={dict.training.signaturePlaceholder}
                className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
                autoComplete="name"
              />
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-foreground-muted">
              {dict.training.signatureDisclaimer}
            </p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </section>

      <div className="mt-4 flex gap-3">
        {stepIndex > 0 && (
          <Button type="button" variant="secondary" className="flex-1" onClick={goBack} disabled={isPending}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            {dict.training.previous}
          </Button>
        )}
        {showAttestation ? (
          <Button
            type="button"
            className={cn("flex-1", stepIndex === 0 && "w-full")}
            onClick={submitCompletion}
            disabled={isPending || (module.requiresSignature && signature.trim().length < 2)}
          >
            {isPending ? dict.training.submitting : dict.training.signAndComplete}
          </Button>
        ) : (
          <Button type="button" className="flex-1" onClick={goNext} disabled={isPending}>
            {dict.training.continue}
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

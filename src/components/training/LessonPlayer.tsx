"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  Play,
} from "lucide-react";
import { completeFormationModuleAction } from "@/lib/actions/training";
import { VideoEmbed } from "@/components/training/video-embed";
import { SopCategorySidebar } from "@/components/training/SopCategorySidebar";
import { parseVideoUrl } from "@/lib/training/video";
import { resolveLockedLabel } from "@/lib/training/lms-ui";
import type { FormationCatalog, FormationModuleDetail } from "@/lib/data/training";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { dna } from "@/lib/design/dna";
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

/**
 * Timeline phases for the lesson:
 * 0 = Introduction (body)
 * 1..n = flash steps / video focus
 * last = quiz / signature
 */
export function LessonPlayer({
  lang,
  dict,
  module,
  catalog,
  defaultSignature = "",
}: {
  lang: Locale;
  dict: Dictionary;
  module: FormationModuleDetail;
  catalog: FormationCatalog;
  defaultSignature?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  const [signature, setSignature] = useState(defaultSignature);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(module.status === "COMPLETED");
  const [isPending, startTransition] = useTransition();

  const videoId = module.videoUrl && parseVideoUrl(module.videoUrl) ? module.videoUrl : null;
  const steps = module.steps;
  const hasSteps = steps.length > 0;

  /** Intro → optional video milestone → steps → attestation */
  const milestones = useMemo(() => {
    const items: { key: string; label: string }[] = [
      { key: "intro", label: "1. Introduction" },
    ];
    if (videoId) {
      items.push({
        key: "video",
        label: `2. ${dict.training.videoBadge}`,
      });
    }
    if (hasSteps) {
      steps.forEach((step, i) => {
        items.push({
          key: `step-${i}`,
          label: `${items.length + 1}. ${step.title}`,
        });
      });
    }
    if (module.requiresSignature || !completed) {
      items.push({
        key: "quiz",
        label: `${items.length + 1}. ${dict.training.signAndComplete}`,
      });
    }
    return items;
  }, [videoId, hasSteps, steps, module.requiresSignature, completed, dict]);

  const maxPhase = Math.max(0, milestones.length - 1);
  const current = milestones[Math.min(phase, maxPhase)];
  const atAttestation = current?.key === "quiz";
  const lockedLabel = resolveLockedLabel(dict, module.lockedLabel);

  function goNext() {
    setError(null);
    if (phase < maxPhase) setPhase((p) => p + 1);
  }

  function goBack() {
    setError(null);
    if (phase > 0) setPhase((p) => p - 1);
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

  if (!module.unlocked) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <Lock className="h-10 w-10 text-foreground-muted" aria-hidden />
        <h1 className="text-lg font-semibold">{module.title}</h1>
        <p className="text-sm text-foreground-muted">
          {lockedLabel ?? dict.training.errors.locked}
        </p>
        <Link
          href={`/${lang}/sops`}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {dict.training.backToList}
        </Link>
      </div>
    );
  }

  if (completed && phase === 0) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
        <Link
          href={`/${lang}/sops`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {dict.training.backToList}
        </Link>
        <section className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center shadow-xs">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="h-7 w-7 text-emerald-600" aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">{dict.training.completedTitle}</h1>
          <p className="mt-2 text-sm text-foreground-muted">{module.title}</p>
          {module.signatureName && (
            <p className="mt-3 text-xs text-foreground-muted">
              {dict.training.signedAs.replace("{name}", module.signatureName)}
            </p>
          )}
        </section>
      </div>
    );
  }

  const showVideo = current?.key === "video" || (current?.key === "intro" && videoId && !hasSteps);
  const stepIndex =
    current?.key.startsWith("step-") ? Number(current.key.replace("step-", "")) : -1;
  const currentStep = stepIndex >= 0 ? steps[stepIndex] : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:gap-6">
      <div className="order-2 flex min-w-0 flex-1 flex-col gap-5 lg:order-1">
        <div className="flex items-center gap-3">
          <Link
            href={`/${lang}/sops`}
            className={cn(dna.iconBtn, "h-9 w-9 rounded-full border border-border")}
            aria-label={dict.training.backToList}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {module.isMandatory && (
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                  {dict.training.mandatory}
                </span>
              )}
              {module.kind === "SAFETY" && (
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                  {dict.training.cnesstBadge}
                </span>
              )}
            </div>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{module.title}</h1>
          </div>
        </div>

        {(showVideo || videoId) && videoId && (current?.key === "video" || current?.key === "intro") && (
          <VideoEmbed url={videoId} title={module.title} />
        )}

        {!showVideo && current?.key === "intro" && (
          <article className={cn(dna.panel, "p-5 sm:p-6")}>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
              {module.body}
            </div>
          </article>
        )}

        {currentStep && (
          <article className={cn(dna.panel, "p-5 sm:p-6")}>
            <h2 className="text-base font-semibold">{currentStep.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
              {currentStep.body}
            </p>
          </article>
        )}

        {atAttestation && !completed && (
          <article className={cn(dna.panel, "p-5 sm:p-6")}>
            {module.summary && (
              <p className="text-sm text-foreground-muted">{module.summary}</p>
            )}
            {module.requiresSignature ? (
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-foreground-muted">
                  {dict.training.signatureLabel}
                </label>
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder={dict.training.signaturePlaceholder}
                  className={dna.field}
                />
                <p className="text-[11px] text-foreground-muted">{dict.training.signatureDisclaimer}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-foreground-muted">{dict.training.markStepSeen}</p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </article>
        )}

        {/* Milestone rail */}
        <div className="flex flex-wrap gap-2">
          {milestones.map((m, i) => {
            const done = i < phase || completed;
            const active = i === phase && !completed;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setPhase(i)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                  done && "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                  active && "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
                  !done && !active && "border-border text-foreground-muted",
                )}
              >
                {done && <Check className="mr-1 inline h-3 w-3" aria-hidden />}
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={phase === 0 || isPending}
            className={cn(dna.ctaGhost, "rounded-full disabled:opacity-40")}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {dict.training.previous}
          </button>

          {atAttestation && !completed ? (
            <button
              type="button"
              disabled={isPending || (module.requiresSignature && signature.trim().length < 2)}
              onClick={submitCompletion}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
            >
              {isPending ? dict.training.submitting : dict.training.signAndComplete}
            </button>
          ) : phase < maxPhase ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              {dict.training.markStepSeen}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <Link
              href={`/${lang}/sops`}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              {dict.training.backToList}
            </Link>
          )}
        </div>
      </div>

      <aside className="order-1 w-full space-y-3 lg:order-2 lg:w-80 lg:shrink-0">
        <div className="hidden lg:block">
          <SopCategorySidebar
            catalog={catalog}
            lang={lang}
            dict={dict}
            activeModuleId={module.id}
          />
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100 lg:mt-0">
          <div className="flex items-start gap-2">
            <Play className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p>{dict.training.trackWarning}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Send } from "lucide-react";
import { generateAutoScheduleAction, publishDraftShiftsAction } from "@/lib/actions/auto-schedule";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function resolveError(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.autoSchedule.errors.unauthorized,
    no_location: dict.autoSchedule.errors.noLocation,
    invalid_date: dict.autoSchedule.errors.invalidDate,
    database_error: dict.autoSchedule.errors.databaseError,
  };
  return map[code] ?? dict.autoSchedule.errors.databaseError;
}

export function AutoScheduleControls({
  weekStartIso,
  dict,
}: {
  weekStartIso: string;
  dict: Dictionary;
}) {
  const router = useRouter();
  const [isGenerating, startGenerate] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);

  function handleGenerate() {
    setMessage(null);
    startGenerate(async () => {
      const result = await generateAutoScheduleAction({ weekStartIso });
      if (!result.ok) {
        setMessage({ tone: "danger", text: resolveError(dict, result.error) });
        return;
      }
      const { summary } = result;
      setMessage({
        tone: summary.unassignedShifts > 0 ? "warning" : "success",
        text: dict.autoSchedule.resultGenerated
          .replace("{assigned}", String(summary.assignedShifts))
          .replace("{total}", String(summary.totalShifts))
          .replace("{unassigned}", String(summary.unassignedShifts)),
      });
      router.refresh();
    });
  }

  function handlePublish() {
    setMessage(null);
    startPublish(async () => {
      const result = await publishDraftShiftsAction({ weekStartIso });
      if (!result.ok) {
        setMessage({ tone: "danger", text: resolveError(dict, result.error) });
        return;
      }
      const parts = [dict.autoSchedule.resultPublished.replace("{count}", String(result.publishedCount))];
      if (result.blockedCount > 0) {
        parts.push(dict.autoSchedule.resultBlocked.replace("{count}", String(result.blockedCount)));
      }
      setMessage({ tone: result.blockedCount > 0 ? "warning" : "success", text: parts.join(" ") });
      router.refresh();
    });
  }

  return (
    <section className={cn("flex flex-col gap-2 p-4", dna.panel)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            {dict.autoSchedule.panelTitle}
          </h3>
          <p className="mt-0.5 text-xs text-foreground-muted">{dict.autoSchedule.panelSubtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || isPublishing}
            className={cn(dna.ctaGhost, "px-3 py-1.5 text-xs disabled:opacity-60")}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {isGenerating ? dict.autoSchedule.generating : dict.autoSchedule.generate}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isGenerating || isPublishing}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {isPublishing ? dict.autoSchedule.publishing : dict.autoSchedule.publish}
          </button>
        </div>
      </div>
      {message && (
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-xs",
            message.tone === "success" && "bg-success/10 text-success",
            message.tone === "warning" && "bg-warning/10 text-warning",
            message.tone === "danger" && "bg-danger/10 text-danger",
          )}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}

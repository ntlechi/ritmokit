"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Radio, UtensilsCrossed } from "lucide-react";
import { updateFoodCostPctAction } from "@/lib/actions/food-cost";
import type { FoodCostSettings } from "@/lib/data/food-cost";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { KpiExplainer } from "@/components/kpi/kpi-explainer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ERROR_KEYS = {
  unauthorized: "unauthorized",
  invalid_value: "invalidValue",
  not_found: "notFound",
  database_error: "databaseError",
} as const;

export function FoodCostSettingsForm({
  settings,
  dict,
  lang,
}: {
  settings: FoodCostSettings;
  dict: Dictionary;
  lang: Locale;
}) {
  const router = useRouter();
  const copy = dict.manager.foodCost;
  const [value, setValue] = useState(
    settings.foodCostPct != null ? String(settings.foodCostPct) : "",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const parsed = Number(value);
  const previewPrime =
    Number.isFinite(parsed) && settings.laborCostPct != null
      ? Math.round((parsed + settings.laborCostPct) * 10) / 10
      : settings.primeCostPct;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateFoodCostPctAction({
        lang,
        foodCostPct: Number(value),
      });
      if (!result.ok) {
        const key = ERROR_KEYS[result.error as keyof typeof ERROR_KEYS] ?? "databaseError";
        setIsError(true);
        setMessage(copy.errors[key as keyof typeof copy.errors] ?? copy.errors.databaseError);
        return;
      }
      setIsError(false);
      setMessage(copy.saved);
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="premium-card p-5">
        <div className="flex items-start gap-2">
          <UtensilsCrossed className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div>
            <div className="flex items-center gap-1">
              <h2 className="text-base font-semibold">{copy.formTitle}</h2>
              <KpiExplainer kpiKey="PRIME_COST_PCT" dict={dict} />
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{copy.formSubtitle}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{copy.foodCostLabel}</span>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={copy.foodCostPlaceholder}
                className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2.5 pr-10 text-sm tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                %
              </span>
            </div>
            <span className="text-[11px] text-foreground-muted">{copy.foodCostHint}</span>
          </label>

          <div className="rounded-xl border border-border-subtle bg-surface-muted p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {copy.laborCostLabel}
            </p>
            <p className="metric mt-1 text-2xl font-bold">
              {settings.laborCostPct != null ? `${settings.laborCostPct.toFixed(1)}%` : "—"}
            </p>
            <p className="mt-1 text-[10px] text-foreground-muted">{copy.laborCostHint}</p>
          </div>

          <div
            className={cn(
              "rounded-xl border p-4",
              previewPrime != null && previewPrime <= 60
                ? "border-success/30 bg-success/5"
                : previewPrime != null && previewPrime <= 65
                  ? "border-warning/30 bg-warning/5"
                  : previewPrime != null
                    ? "border-danger/30 bg-danger/5"
                    : "border-border-subtle bg-surface-muted",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              {copy.primeCostLabel}
            </p>
            <p className="metric mt-1 text-2xl font-bold">
              {previewPrime != null ? `${previewPrime.toFixed(1)}%` : "—"}
            </p>
            <p className="mt-1 text-[10px] text-foreground-muted">{copy.primeCostHint}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={isPending || !value}>
            {isPending ? copy.saving : copy.save}
          </Button>
          {message && (
            <p className={cn("text-sm", isError ? "text-danger" : "text-success")}>{message}</p>
          )}
        </div>
      </section>

      <section className="premium-card p-5">
        <h3 className="text-sm font-semibold">{copy.integrationsTitle}</h3>
        <p className="mt-1 text-xs text-foreground-muted">{copy.integrationsSubtitle}</p>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-muted px-3 py-3">
            <Radio
              className={cn("mt-0.5 h-4 w-4 shrink-0", settings.posConnected ? "text-success" : "text-foreground-muted")}
              aria-hidden
            />
            <div>
              <p className="text-sm font-medium">{copy.clusterTitle}</p>
              <p className="text-xs text-foreground-muted">
                {settings.posConnected
                  ? copy.clusterConnected.replace("{provider}", settings.posProvider ?? "CLUSTER")
                  : copy.clusterPending}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-muted px-3 py-3">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium">{copy.restockTitle}</p>
              <p className="text-xs text-foreground-muted">{copy.restockPending}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}

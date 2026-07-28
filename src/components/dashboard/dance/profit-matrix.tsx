"use client";

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, Filter, Table2 } from "lucide-react";
import type { ClassEconomicsRow } from "@/lib/dance/analytics";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

function money(value: number, lang: Locale) {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-ES" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

type SortKey = "grossMargin" | "roomYieldPerSqm" | "utilizationPct" | "revenue";

export function ProfitMatrix({
  rows,
  lang,
  dict,
}: {
  rows: ClassEconomicsRow[];
  lang: Locale;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const [sortKey, setSortKey] = useState<SortKey>("grossMargin");
  const [bottomOnly, setBottomOnly] = useState(false);

  const sorted = useMemo(() => {
    const list = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? Number.NEGATIVE_INFINITY;
      const bv = b[sortKey] ?? Number.NEGATIVE_INFINITY;
      return (bv as number) - (av as number);
    });
    if (!bottomOnly || list.length === 0) return list;
    const byProfit = [...rows].sort((a, b) => a.grossMargin - b.grossMargin);
    const cut = Math.max(1, Math.ceil(byProfit.length * 0.1));
    const bottomIds = new Set(byProfit.slice(0, cut).map((r) => r.sessionId));
    return list.filter((r) => bottomIds.has(r.sessionId));
  }, [rows, sortKey, bottomOnly]);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-accent" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">{c.profit.title}</h2>
            <p className="text-xs text-foreground-muted">{c.profit.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setBottomOnly((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
            bottomOnly
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border text-foreground-muted hover:bg-surface-muted",
          )}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          {c.profit.bottomFilter}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["grossMargin", c.profit.sortProfit],
            ["roomYieldPerSqm", c.profit.sortYield],
            ["utilizationPct", c.profit.sortUtil],
            ["revenue", c.profit.sortRevenue],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortKey(key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
              sortKey === key
                ? "bg-accent text-accent-foreground"
                : "bg-surface-muted text-foreground-muted",
            )}
          >
            {sortKey === key && <ArrowDownWideNarrow className="h-3 w-3" aria-hidden />}
            {label}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="mt-6 text-sm text-foreground-muted">{c.profit.empty}</p>
      ) : (
        <div className="mt-4 max-h-[22rem] flex-1 overflow-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-foreground-muted">
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-semibold">{c.profit.colClass}</th>
                <th className="px-2 py-2 font-semibold">{c.profit.colInstructor}</th>
                <th className="px-2 py-2 font-semibold">{c.profit.colUtil}</th>
                <th className="px-2 py-2 font-semibold">{c.profit.colRevenue}</th>
                <th className="px-2 py-2 font-semibold">{c.profit.colProfit}</th>
                <th className="px-2 py-2 font-semibold">{c.profit.colYield}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const unprofitable = row.grossMargin < 0;
                return (
                  <tr
                    key={row.sessionId}
                    className={cn(
                      "border-b border-border-subtle",
                      unprofitable && "bg-danger/5",
                    )}
                  >
                    <td className="px-2 py-2">
                      <p className="font-medium text-foreground">{row.courseTitle}</p>
                      <p className="text-foreground-muted">
                        {row.style} · {row.roomName}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-foreground-muted">{row.instructorName}</td>
                    <td className="px-2 py-2 tabular-nums">{row.utilizationPct.toFixed(0)}%</td>
                    <td className="px-2 py-2 tabular-nums">{money(row.revenue, lang)}</td>
                    <td
                      className={cn(
                        "px-2 py-2 font-semibold tabular-nums",
                        unprofitable ? "text-danger" : "text-success",
                      )}
                    >
                      {money(row.grossMargin, lang)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-foreground-muted">
                      {row.roomYieldPerSqm != null
                        ? `${money(row.roomYieldPerSqm, lang)}/m²`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

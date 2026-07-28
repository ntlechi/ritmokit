"use client";

import Link from "next/link";
import { AlertTriangle, Radar } from "lucide-react";
import type { ParitySnapshot } from "@/lib/dance/analytics";
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

function statusTone(status: ParitySnapshot["status"]) {
  if (status === "balanced") return "border-success/40 bg-success/10 text-success";
  if (status === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-danger/40 bg-danger/10 text-danger";
}

function gaugeFill(leads: number, follows: number, maxLeads: number, maxFollows: number) {
  const leadPct = maxLeads > 0 ? Math.min(100, (leads / maxLeads) * 100) : 0;
  const followPct = maxFollows > 0 ? Math.min(100, (follows / maxFollows) * 100) : 0;
  return { leadPct, followPct };
}

export function ParityRadar({
  parity,
  blockedRevenue,
  lang,
  dict,
}: {
  parity: ParitySnapshot[];
  blockedRevenue: number;
  lang: Locale;
  dict: Dictionary;
}) {
  const c = dict.studioCockpit;
  const active = [...parity].sort((a, b) => {
    const rank = { blocked: 0, warning: 1, balanced: 2 } as const;
    return rank[a.status] - rank[b.status] || b.imbalance - a.imbalance;
  });

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-accent" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold">{c.parity.title}</h2>
            <p className="text-xs text-foreground-muted">{c.parity.subtitle}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background px-3 py-2 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            {c.parity.blockedRevenue}
          </p>
          <p className="metric text-lg font-bold text-danger">{money(blockedRevenue, lang)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-success">{c.parity.balanced}</span>
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">{c.parity.warning}</span>
        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-danger">{c.parity.blocked}</span>
      </div>

      {active.length === 0 ? (
        <p className="mt-6 flex-1 text-sm text-foreground-muted">{c.parity.empty}</p>
      ) : (
        <ul className="mt-4 max-h-[22rem] flex-1 space-y-2 overflow-y-auto pr-1">
          {active.map((row) => {
            const { leadPct, followPct } = gaugeFill(
              row.leadsFilled,
              row.followsFilled,
              row.maxLeads,
              row.maxFollows,
            );
            return (
              <li
                key={row.sessionId}
                className="rounded-xl border border-border-subtle bg-background/60 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.courseTitle}</p>
                    <p className="mt-0.5 text-[11px] text-foreground-muted">
                      L {row.leadsFilled}/{row.maxLeads} · F {row.followsFilled}/{row.maxFollows}
                      {row.waitlistedCount > 0 && (
                        <span className="ml-1 text-warning">
                          · {row.waitlistedCount} {c.parity.waitlisted}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                      statusTone(row.status),
                    )}
                  >
                    {row.status !== "balanced" && <AlertTriangle className="h-3 w-3" aria-hidden />}
                    Δ{row.imbalance}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] text-foreground-muted">{c.parity.leads}</p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{ width: `${leadPct}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] text-foreground-muted">{c.parity.follows}</p>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-full rounded-full bg-rose-500 transition-all"
                        style={{ width: `${followPct}%` }}
                      />
                    </div>
                  </div>
                </div>
                {row.blockedRevenue > 0 && (
                  <p className="mt-2 text-[11px] text-danger">
                    {c.parity.blockedForClass}: {money(row.blockedRevenue, lang)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={`/${lang}/sessions`}
        className="mt-4 text-xs font-medium text-accent hover:underline"
      >
        {c.parity.openSessions}
      </Link>
    </section>
  );
}

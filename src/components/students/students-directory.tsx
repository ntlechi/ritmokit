"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { dna } from "@/lib/design/dna";
import type { CrmStudentListItem } from "@/lib/data/students-crm";
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

function formatDay(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : lang === "es" ? "es" : "fr-CA", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

type FilterKey = "all" | "unpaid" | "waitlist" | "ready" | "churn";

export function StudentsDirectory({
  lang,
  students,
  dict,
}: {
  lang: Locale;
  students: CrmStudentListItem[];
  dict: Dictionary;
}) {
  const c = dict.crm;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      if (filter === "unpaid" && s.unpaidCount === 0) return false;
      if (filter === "waitlist" && s.waitlistedCount === 0) return false;
      if (filter === "ready" && s.readyCount === 0) return false;
      if (filter === "churn" && !s.churnRisk) return false;
      if (!needle) return true;
      return (
        s.fullName.toLowerCase().includes(needle) ||
        s.email.toLowerCase().includes(needle) ||
        (s.phone ?? "").includes(needle) ||
        s.styles.some((st) => st.toLowerCase().includes(needle))
      );
    });
  }, [students, q, filter]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "all", label: c.filterAll },
    { key: "unpaid", label: c.filterUnpaid },
    { key: "waitlist", label: c.filterWaitlist },
    { key: "ready", label: c.filterReady },
    { key: "churn", label: c.filterChurn },
  ];

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{c.search}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={c.search}
            className={cn(dna.field, "min-h-11 pl-10")}
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              data-interactive
              onClick={() => setFilter(key)}
              className={cn(
                "min-h-11 rounded-xl px-3.5 text-sm font-semibold",
                filter === key
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-muted text-foreground-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-foreground-muted">
        <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span>{" "}
        {c.count}
      </p>

      {filtered.length === 0 ? (
        <div className={cn(dna.panel, "flex flex-col items-center gap-2 px-4 py-12 text-center")}>
          <Users className="h-6 w-6 text-foreground-muted" aria-hidden />
          <p className="text-sm font-medium">{c.empty}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {filtered.map((s) => (
            <li key={s.studentId}>
              <Link
                href={`/${lang}/students/${s.studentId}`}
                data-interactive
                className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight">{s.fullName}</p>
                  <p className="truncate text-xs text-foreground-muted">
                    {s.email}
                    {s.phone ? ` · ${s.phone}` : ""}
                    {s.styles.length > 0 ? ` · ${s.styles.slice(0, 3).join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  {s.unpaidCount > 0 && (
                    <span className="rounded-lg bg-warning/15 px-2 py-1 text-warning">
                      {s.unpaidCount} {c.unpaid}
                    </span>
                  )}
                  {s.waitlistedCount > 0 && (
                    <span className="rounded-lg bg-surface-muted px-2 py-1 text-foreground-muted">
                      {s.waitlistedCount} {c.waitlisted}
                    </span>
                  )}
                  {s.readyCount > 0 && (
                    <span className="rounded-lg bg-yield/15 px-2 py-1 text-yield">
                      {c.filterReady}
                    </span>
                  )}
                  {s.churnRisk && (
                    <span className="rounded-lg bg-danger/10 px-2 py-1 text-danger">{c.filterChurn}</span>
                  )}
                  <span className="tabular-nums text-foreground-muted">
                    {money(s.lifetimeCad, lang)}
                  </span>
                  <span className="text-foreground-muted">
                    {c.lastSeen} {formatDay(s.lastEnrolledAt, lang)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { Coins } from "lucide-react";
import { formatTimeRange } from "@/lib/calendar/format";
import { stationLabel, stationRailStyle } from "@/lib/stations/display";
import type { EmployeeTipsSummary } from "@/lib/data/tips";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

function formatSignedDate(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

export function EmployeeTipsCard({
  summary,
  locale,
  dict,
}: {
  summary: EmployeeTipsSummary;
  locale: Locale;
  dict: Dictionary;
}) {
  const { poolConfig, entries, periodTotal } = summary;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
            <Coins className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold">{dict.tips.myTips}</h2>
            <p className="text-xs text-foreground-muted">{dict.tips.myTipsSubtitle}</p>
          </div>
        </div>
        {entries.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-foreground-muted">{dict.tips.periodTotal}</p>
            <p className="metric text-lg font-semibold text-success">+{periodTotal.toFixed(2)}$</p>
          </div>
        )}
      </div>

      {poolConfig?.status === "APPROVED" && poolConfig.isActive && poolConfig.votedAt ? (
        <p className="mt-3 text-xs text-foreground-muted">
          {dict.tips.poolAgreementSigned.replace("{date}", formatSignedDate(poolConfig.votedAt, locale))}
        </p>
      ) : (
        <p className="mt-3 text-xs text-foreground-muted">{dict.tips.poolNotActive}</p>
      )}

      {entries.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-muted px-4 py-6 text-center text-sm text-foreground-muted">
          {dict.tips.emptyHistory}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.shiftId}
              className="rounded-xl border-l-4 bg-surface-muted px-3 py-2.5"
              style={stationRailStyle(entry.stationColorHex)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {formatTimeRange(new Date(entry.startsAt), new Date(entry.endsAt), locale)} ·{" "}
                    {stationLabel(
                      { nameFr: entry.stationNameFr, nameEn: entry.stationNameEn, nameEs: entry.stationNameEs },
                      locale,
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {entry.workedHours.toFixed(1)}h ·{" "}
                    {dict.tips.weightMultiplier.replace("{weight}", String(entry.stationPoints))}
                  </p>
                </div>
                <p className="metric text-sm font-semibold text-success">+{entry.amountPaid.toFixed(2)}$</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

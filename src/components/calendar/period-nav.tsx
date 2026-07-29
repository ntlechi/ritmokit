import Link from "next/link";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { WeekStartPicker } from "@/components/calendar/week-start-picker";
import { dna } from "@/lib/design/dna";
import type { WeekStartDay } from "@/lib/calendar/week-start";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type PeriodView = "month" | "week" | "day";

const stepFns: Record<PeriodView, (date: Date, amount: number) => Date> = {
  month: addMonths,
  week: addWeeks,
  day: addDays,
};

function dateHref(lang: Locale, view: PeriodView, date?: Date) {
  const base = `/${lang}/calendar/${view}`;
  return date ? `${base}?date=${format(date, "yyyy-MM-dd")}` : base;
}

const navItemClass =
  "flex h-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground";

/** En-tête de période : libellé + navigation ‹ Aujourd'hui › (liens ?date=). */
export function PeriodNav({
  lang,
  view,
  anchor,
  label,
  dict,
  weekStart,
}: {
  lang: Locale;
  view: PeriodView;
  anchor: Date;
  label: string;
  dict: Dictionary;
  /** Affiche le sélecteur de début de semaine quand défini (vues semaine/mois). */
  weekStart?: WeekStartDay;
}) {
  const step = stepFns[view];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold capitalize tracking-tight">{label}</h2>
      <div className="flex items-center gap-1.5">
        {weekStart != null && <WeekStartPicker value={weekStart} locale={lang} dict={dict} />}
        <Link
          href={dateHref(lang, view, step(anchor, -1))}
          aria-label="‹"
          data-interactive
          className={`${navItemClass} w-9`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          href={dateHref(lang, view)}
          data-interactive
          className={`${navItemClass} px-3.5 text-sm font-medium`}
        >
          {dict.calendar.today}
        </Link>
        <Link
          href={dateHref(lang, view, step(anchor, 1))}
          aria-label="›"
          data-interactive
          className={`${navItemClass} w-9`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

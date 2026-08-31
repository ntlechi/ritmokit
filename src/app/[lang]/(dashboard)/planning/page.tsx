import { notFound, redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { StudioCalendarBoard } from "@/components/planning/studio-calendar-board";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import {
  getMonthRange,
  getQuarterRange,
  getWeekRange,
  getYearRange,
  parseDateParam,
  parseStudioView,
} from "@/lib/calendar/grid";
import {
  formatMonthLabel,
  formatQuarterLabel,
  formatWeekRangeLabel,
  formatYearLabel,
} from "@/lib/calendar/format";
import { getStudioCalendarForUser } from "@/lib/data/studio-calendar";
import { safeQuery } from "@/lib/data/safe";
import { dna } from "@/lib/design/dna";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [{ date, view: viewParam }, dict, user] = await Promise.all([
    searchParams,
    getDictionary(lang),
    getSessionUser(),
  ]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);

  const view = parseStudioView(viewParam);
  const anchor = parseDateParam(date);
  const range =
    view === "month"
      ? getMonthRange(anchor)
      : view === "quarter"
        ? getQuarterRange(anchor)
        : view === "year"
          ? getYearRange(anchor)
          : getWeekRange(anchor);

  const label =
    view === "month"
      ? formatMonthLabel(anchor, lang)
      : view === "quarter"
        ? formatQuarterLabel(anchor, lang)
        : view === "year"
          ? formatYearLabel(anchor)
          : formatWeekRangeLabel(range.start, range.end, lang);

  const { data, dbError } = await safeQuery(
    () => getStudioCalendarForUser(user.id, lang, range.start, range.end),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <CalendarRange className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {dict.planning.badge}
            </p>
            <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
              {dict.planning.title}
            </h1>
            <p className={dna.subtitle}>{dict.planning.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
        {dbError && <DbErrorBanner label={dict.common.dbDisconnected} />}
        {!dbError && !data && (
          <p className="text-sm text-foreground-muted">{dict.planning.emptySelect}</p>
        )}
        {data && (
          <StudioCalendarBoard
            data={data}
            lang={lang}
            dict={dict}
            view={view}
            anchorIso={formatIsoLocal(anchor)}
            label={label}
          />
        )}
      </div>
    </div>
  );
}

function formatIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

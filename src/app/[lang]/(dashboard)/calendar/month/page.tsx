import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MonthView } from "@/components/calendar/month-view";
import { PeriodNav } from "@/components/calendar/period-nav";
import { DbErrorBanner } from "@/components/db-error-banner";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { getMonthGridDays, getMonthRange, parseDateParam } from "@/lib/calendar/grid";
import { WEEK_START_COOKIE, LEGACY_WEEK_START_COOKIE, readWeekStartCookie } from "@/lib/calendar/week-start";
import { formatMonthLabel } from "@/lib/calendar/format";
import { getShiftsInRange } from "@/lib/data/shifts";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function MonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const { date } = await searchParams;
  const anchor = parseDateParam(date);
  const userPromise = getSessionUser();
  const dictPromise = getDictionary(lang);
  const cookiePromise = cookies();
  const user = await userPromise;
  const [dict, cookieStore, membership] = await Promise.all([
    dictPromise,
    cookiePromise,
    user ? getPrimaryMembership(user.id) : Promise.resolve(null),
  ]);
  const weekStart = readWeekStartCookie(
    cookieStore.get(WEEK_START_COOKIE)?.value,
    cookieStore.get(LEGACY_WEEK_START_COOKIE)?.value,
  );
  const days = getMonthGridDays(anchor, weekStart);
  const { start, end } = getMonthRange(anchor, weekStart);
  const locationId = membership?.locationId;

  const { data: shifts, dbError } = await safeQuery(
    () =>
      locationId
        ? getShiftsInRange(start, end, locationId, { includeHourlyRate: false })
        : Promise.resolve([]),
    [],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PeriodNav
        lang={lang}
        view="month"
        anchor={anchor}
        label={formatMonthLabel(anchor, lang)}
        dict={dict}
        weekStart={weekStart}
      />
      {dbError && <DbErrorBanner label={dict.common.dbDisconnected} />}
      <MonthView days={days} shifts={shifts} anchor={anchor} locale={lang} dict={dict} />
    </div>
  );
}

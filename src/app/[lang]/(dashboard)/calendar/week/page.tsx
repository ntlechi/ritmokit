import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AutoScheduleControls } from "@/components/calendar/auto-schedule-controls";
import { SuccessionAlertsBanner } from "@/components/calendar/succession-alerts-banner";
import { WeeklyCoverageAlerts } from "@/components/calendar/weekly-coverage-alerts";
import { WeekView } from "@/components/calendar/week-view";
import { PeriodNav } from "@/components/calendar/period-nav";
import { DbErrorBanner } from "@/components/db-error-banner";
import {
  canAccessManagerSettings,
  getPrimaryMembership,
  getSessionUser,
} from "@/lib/auth/session";
import { getWeekDays, getWeekRange, parseDateParam } from "@/lib/calendar/grid";
import { WEEK_START_COOKIE, LEGACY_WEEK_START_COOKIE, readWeekStartCookie } from "@/lib/calendar/week-start";
import { formatWeekRangeLabel } from "@/lib/calendar/format";
import { getWeeklyCoverageForUser } from "@/lib/data/coverage";
import { getEmployeeRoster } from "@/lib/data/employees";
import { getStationsForUser } from "@/lib/data/stations";
import { getWeeklySuccessionAlerts } from "@/lib/data/skills";
import { getShiftsInRange } from "@/lib/data/shifts";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function WeekPage({
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
  const days = getWeekDays(anchor, weekStart);
  const { start, end } = getWeekRange(anchor, weekStart);
  const locationId = membership?.locationId;
  const isManager = Boolean(user && canAccessManagerSettings(user.role));

  const [
    { data: shifts, dbError: shiftsError },
    { data: roster, dbError: rosterError },
    { data: coverageResult },
    { data: successionDays },
    { data: stationCtx },
  ] = await Promise.all([
    safeQuery(
      () =>
        locationId
          ? getShiftsInRange(start, end, locationId, { includeHourlyRate: isManager })
          : Promise.resolve([]),
      [],
    ),
    safeQuery(
      () =>
        locationId
          ? getEmployeeRoster(locationId, { includeHourlyRate: isManager })
          : Promise.resolve([]),
      [],
    ),
    safeQuery(
      () =>
        isManager && user
          ? getWeeklyCoverageForUser(user.id, user.role, days)
          : Promise.resolve(null),
      null,
    ),
    safeQuery(
      () =>
        isManager && user
          ? getWeeklySuccessionAlerts(user.id, user.role, days)
          : Promise.resolve(null),
      null,
    ),
    safeQuery(
      () => (isManager && user ? getStationsForUser(user.id) : Promise.resolve(null)),
      null,
    ),
  ]);
  const stations = stationCtx?.stations ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <PeriodNav
        lang={lang}
        view="week"
        anchor={anchor}
        label={formatWeekRangeLabel(start, end, lang)}
        dict={dict}
        weekStart={weekStart}
      />
      {(shiftsError || rosterError) && (
        <DbErrorBanner label={dict.common.dbDisconnected} />
      )}
      {isManager && <AutoScheduleControls weekStartIso={start.toISOString()} dict={dict} />}
      {isManager && successionDays && successionDays.length > 0 && (
        <SuccessionAlertsBanner days={successionDays} stations={stations} locale={lang} dict={dict} />
      )}
      {isManager && coverageResult?.ok && (
        <WeeklyCoverageAlerts days={coverageResult.days} stations={stations} locale={lang} dict={dict} />
      )}
      <WeekView
        days={days}
        roster={roster}
        shifts={shifts}
        locale={lang}
        dict={dict}
        planningMode={isManager}
      />
    </div>
  );
}

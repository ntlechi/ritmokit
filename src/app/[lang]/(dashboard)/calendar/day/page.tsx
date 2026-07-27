import { notFound } from "next/navigation";
import { DayView } from "@/components/calendar/day-view";
import { LaborKpiBar } from "@/components/calendar/labor-kpi-bar";
import { PeriodNav } from "@/components/calendar/period-nav";
import { DbErrorBanner } from "@/components/db-error-banner";
import {
  canAccessManagerSettings,
  getPrimaryMembership,
  getSessionUser,
} from "@/lib/auth/session";
import { getDayRange, parseDateParam } from "@/lib/calendar/grid";
import { formatDayLabel } from "@/lib/calendar/format";
import { getLiveLaborKpisForUser } from "@/lib/data/labor-kpis";
import { getShiftsInRange } from "@/lib/data/shifts";
import { getStationsForUser } from "@/lib/data/stations";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function DayPage({
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
  const { start, end } = getDayRange(anchor);

  const userPromise = getSessionUser();
  const dictPromise = getDictionary(lang);
  const user = await userPromise;
  const [dict, membership] = await Promise.all([
    dictPromise,
    user ? getPrimaryMembership(user.id) : Promise.resolve(null),
  ]);
  const locationId = membership?.locationId;
  const showLaborKpis = Boolean(user && canAccessManagerSettings(user.role));

  const [
    { data: shifts, dbError },
    { data: stationsResult },
    { data: laborKpiResult },
  ] = await Promise.all([
    safeQuery(
      () =>
        locationId
          ? getShiftsInRange(start, end, locationId, { includeHourlyRate: showLaborKpis })
          : Promise.resolve([]),
      [],
    ),
    safeQuery(() => (user ? getStationsForUser(user.id) : Promise.resolve(null)), null),
    safeQuery(
      () =>
        showLaborKpis && user
          ? getLiveLaborKpisForUser(user.id, user.role, start)
          : Promise.resolve(null),
      null,
    ),
  ]);
  const stations = stationsResult?.stations ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <PeriodNav
        lang={lang}
        view="day"
        anchor={anchor}
        label={formatDayLabel(anchor, lang)}
        dict={dict}
      />
      {dbError && (
        <DbErrorBanner label={dict.common.dbDisconnected} />
      )}
      {laborKpiResult?.ok && <LaborKpiBar dict={dict} report={laborKpiResult.data} />}
      <DayView day={start} shifts={shifts} stations={stations} locale={lang} dict={dict} />
    </div>
  );
}

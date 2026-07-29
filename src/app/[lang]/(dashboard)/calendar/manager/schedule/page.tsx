import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ManagerScheduleView } from "@/components/calendar/manager-schedule-view";
import { WeekStartPicker } from "@/components/calendar/week-start-picker";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { formatWeekRangeLabel } from "@/lib/calendar/format";
import { getWeekDays, getWeekRange, parseDateParam } from "@/lib/calendar/grid";
import { WEEK_START_COOKIE, LEGACY_WEEK_START_COOKIE, readWeekStartCookie } from "@/lib/calendar/week-start";
import { getEmployeeRoster } from "@/lib/data/employees";
import { getManagerSchedulePayload } from "@/lib/data/manager-schedule";
import { getScheduleTemplatesForLocation } from "@/lib/data/schedule-templates";
import { getShiftsInRange } from "@/lib/data/shifts";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ManagerSchedulePage({
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
  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);

  if (!user || !canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/calendar/week`);
  }

  const cookieStore = await cookies();
  const weekStart = readWeekStartCookie(
    cookieStore.get(WEEK_START_COOKIE)?.value,
    cookieStore.get(LEGACY_WEEK_START_COOKIE)?.value,
  );
  const days = getWeekDays(anchor, weekStart);
  const { start, end } = getWeekRange(anchor, weekStart);

  const membership = await prisma.locationMember.findFirst({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { locationId: true },
  });
  const locationId = membership?.locationId;

  const [
    { data: shifts, dbError: shiftsError },
    { data: roster, dbError: rosterError },
    { data: schedulePayload, dbError: scheduleError },
    { data: templates, dbError: templatesError },
  ] = await Promise.all([
    safeQuery(
      () =>
        locationId
          ? getShiftsInRange(start, end, locationId, { includeHourlyRate: true })
          : Promise.resolve([]),
      [],
    ),
    safeQuery(
      () => (locationId ? getEmployeeRoster(locationId, { includeHourlyRate: true }) : Promise.resolve([])),
      [],
    ),
    safeQuery(() => getManagerSchedulePayload(user.id, user.role, days), null),
    safeQuery(async () => {
      if (!locationId) return [];
      return getScheduleTemplatesForLocation(locationId);
    }, []),
  ]);

  if (!schedulePayload?.ok) {
    redirect(`/${lang}/calendar/week`);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-medium">{dict.schedule.title}</h2>
          <p className="text-sm capitalize text-foreground-muted">{formatWeekRangeLabel(start, end, lang)}</p>
        </div>
        <WeekStartPicker value={weekStart} locale={lang} dict={dict} />
      </div>

      {(shiftsError || rosterError || scheduleError || templatesError) && (
        <DbErrorBanner label={dict.common.dbDisconnected} />
      )}

      <ManagerScheduleView
        days={days}
        weekStartIso={start.toISOString()}
        roster={roster}
        shifts={shifts}
        scheduleDays={schedulePayload.days}
        stations={schedulePayload.stations}
        profiles={schedulePayload.profiles}
        templates={templates}
        locale={lang}
        dict={dict}
      />
    </div>
  );
}

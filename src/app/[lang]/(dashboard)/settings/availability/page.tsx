import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { WeeklyAvailabilityGrid } from "@/components/availability/weekly-availability-grid";
import { getSessionUser } from "@/lib/auth/session";
import { getWeeklyAvailabilityForUser } from "@/lib/data/availability";
import { safeQuery } from "@/lib/data/safe";
import { getTimeOffHistoryForUser } from "@/lib/data/timeoff";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export default async function AvailabilitySettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }

  const [{ data: weekly, dbError: weeklyError }, { data: timeOffHistory, dbError: timeOffError }] =
    await Promise.all([
      safeQuery(() => getWeeklyAvailabilityForUser(user.id), null),
      safeQuery(() => getTimeOffHistoryForUser(user.id), []),
    ]);

  if (weeklyError || timeOffError) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.availability.errors.databaseError}</p>
        <Link href={`/${lang}/settings`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.title}
        </Link>
      </div>
    );
  }

  if (!weekly) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight">{dict.availability.title}</h1>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="max-w-sm rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-foreground-muted" aria-hidden />
            <p className="mt-3 text-sm text-foreground-muted">{dict.availability.noProfile}</p>
            <Link href={`/${lang}/settings`} className="mt-4 inline-block text-sm text-accent hover:underline">
              ← {dict.settings.title}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <WeeklyAvailabilityGrid
      lang={lang}
      dict={dict}
      initialSlots={weekly.slots}
      initialTimeOffRequests={timeOffHistory}
    />
  );
}

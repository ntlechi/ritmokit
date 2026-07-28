import { notFound, redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { StationsDashboard } from "@/components/manager/stations-dashboard";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getStationsForUser } from "@/lib/data/stations";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);

  const { data: result, dbError } = await safeQuery(
    () => getStationsForUser(user.id, { activeOnly: false }),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <DoorOpen className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="display-title text-xl font-bold tracking-tight">{dict.nav.rooms}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.dance.roomsIntro}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {dbError && <DbErrorBanner label={dict.manager.stations.errors.databaseError} />}
        {result && (
          <StationsDashboard
            locationId={result.locationId}
            stations={result.stations}
            dict={dict}
            locale={lang}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

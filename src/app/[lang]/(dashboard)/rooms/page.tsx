import { notFound, redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { RoomsDashboard } from "@/components/rooms/rooms-dashboard";
import { DbErrorBanner } from "@/components/db-error-banner";
import { dna } from "@/lib/design/dna";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getRoomsOverviewForUser } from "@/lib/data/rooms-overview";
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

  const { data: overview, dbError } = await safeQuery(
    () => getRoomsOverviewForUser(user.id, { activeOnly: false }),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <DoorOpen className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {dict.rooms.badge}
            </p>
            <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
              {dict.nav.rooms}
            </h1>
            <p className={dna.subtitle}>{dict.rooms.intro}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
        {dbError && <DbErrorBanner label={dict.manager.stations.errors.databaseError} />}
        {overview && <RoomsDashboard overview={overview} lang={lang} dict={dict} />}
      </div>
    </div>
  );
}

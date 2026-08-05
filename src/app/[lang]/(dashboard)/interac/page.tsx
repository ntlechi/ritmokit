import { notFound, redirect } from "next/navigation";
import { Banknote } from "lucide-react";
import { InteracQueuePanel } from "@/components/interac/interac-queue-panel";
import { DbErrorBanner } from "@/components/db-error-banner";
import { dna } from "@/lib/design/dna";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getInteracDashboardData } from "@/lib/payments/interac";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function InteracPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);

  const { data, dbError } = await safeQuery(
    () => getInteracDashboardData(user.id, user.role),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Banknote className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {dict.interac.badge}
            </p>
            <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
              {dict.nav.interac}
            </h1>
            <p className={dna.subtitle}>{dict.interac.intro}</p>
          </div>
        </div>
      </header>

      {dbError && (
        <div className="px-4 pt-4 sm:px-6">
          <DbErrorBanner label={dict.interac.errors.databaseError} />
        </div>
      )}
      {data && <InteracQueuePanel lang={lang} dict={dict} initial={data} />}
    </div>
  );
}

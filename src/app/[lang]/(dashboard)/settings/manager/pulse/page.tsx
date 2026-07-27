import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { PulseManagerSnapshot } from "@/components/pulse/pulse-manager-snapshot";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getPulseSnapshotForManager } from "@/lib/data/pulse";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function ManagerPulsePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user || !canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/settings`);
  }

  const { data: snapshot, dbError } = await safeQuery(
    () => getPulseSnapshotForManager(user.id, user.role, lang),
    null,
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <Link
          href={`/${lang}/settings/manager`}
          className="text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          ← {dict.settings.manager}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <Activity className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.pulse.managerTitle}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.pulse.managerSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {dbError && (
          <p className="text-sm text-danger">{dict.pulse.errors.databaseError}</p>
        )}
        {snapshot ? (
          <PulseManagerSnapshot snapshot={snapshot} dict={dict} locale={lang} />
        ) : (
          <p className="text-sm text-foreground-muted">{dict.pulse.emptyWeek}</p>
        )}
        <p className="text-xs text-foreground-muted">{dict.pulse.privacyNote}</p>
      </div>
    </div>
  );
}

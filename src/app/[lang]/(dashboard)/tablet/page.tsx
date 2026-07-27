import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TabletShell } from "@/components/tablet/tablet-shell";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getLiveTabletSnapshot } from "@/lib/data/tablet-dashboard";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function TabletPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ demo?: string; day?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);

  const forceDemo = sp.demo === "1";
  const day = Math.min(5, Math.max(1, Number(sp.day) || 3));

  const { data: live } = await safeQuery(
    () => (forceDemo ? Promise.resolve(null) : getLiveTabletSnapshot(user.id, user.role, lang)),
    null,
  );

  const useLive = Boolean(live) && !forceDemo;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Tablette plancher</h1>
          <p className="text-xs text-foreground-muted">
            {useLive ? "Données live" : "Mode démo — scrubber J1–J5"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${lang}/tablet?demo=1`}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground-muted"
          >
            Démo
          </Link>
          <Link
            href={`/${lang}/tablet`}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground-muted"
          >
            Live
          </Link>
          <Link
            href={`/${lang}/demo/franchise`}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground-muted"
          >
            Hub démo
          </Link>
          <Link
            href={`/${lang}/dashboard`}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
          >
            {dict.nav.cockpit}
          </Link>
        </div>
      </header>
      <div className="flex flex-1 justify-center px-3 py-4 sm:px-6">
        <TabletShell
          initialDay={day}
          live={useLive}
          livePayload={useLive ? live : null}
          locationId={live?.locationId}
        />
      </div>
    </div>
  );
}

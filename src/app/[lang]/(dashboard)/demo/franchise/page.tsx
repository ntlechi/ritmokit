import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TabletShell } from "@/components/tablet/tablet-shell";
import { FranchiseJourneyDemo } from "@/components/onboarding/journey/franchise-journey-demo";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { DEMO_BRAND } from "@/lib/demo/franchise-pitch";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function DemoFranchisePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ day?: string; view?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);

  const day = Math.min(5, Math.max(1, Number(sp.day) || 3));
  const view = sp.view === "journey" ? "journey" : "tablet";
  const brand = DEMO_BRAND;

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ "--brand": brand.primaryColor } as React.CSSProperties}
    >
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground-muted">
              Mode démo
            </p>
            <h1 className="display-title mt-1 text-xl font-bold tracking-tight">
              Franchise Onboarding OS
            </h1>
            <p className="mt-1 max-w-xl text-sm text-foreground-muted">
              Parcours investisseur · {brand.name} · tablette gérant + voyage employé J1–J5
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${lang}/demo/franchise?view=tablet&day=${day}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                view === "tablet"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "border border-border bg-surface text-foreground-muted"
              }`}
            >
              Tablette
            </Link>
            <Link
              href={`/${lang}/demo/franchise?view=journey&day=${day}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                view === "journey"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "border border-border bg-surface text-foreground-muted"
              }`}
            >
              Parcours employé
            </Link>
            <Link
              href={`/${lang}/tablet`}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white"
              style={{ background: brand.primaryColor }}
            >
              Ouvrir tablette plein écran
            </Link>
            <Link
              href={`/${lang}/dashboard`}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground-muted"
            >
              {dict.nav.cockpit}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-6 px-4 py-6 sm:px-6">
        {view === "tablet" ? (
          <TabletShell initialDay={day} />
        ) : (
          <FranchiseJourneyDemo initialDay={day} />
        )}
        <p className="text-center text-xs text-foreground-muted">
          PINs démo : Sofia 1234 · Karim 2222 · Maya 3333 · Jonas 4444
        </p>
      </div>
    </div>
  );
}

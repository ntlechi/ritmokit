import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users, Scale, ClipboardList, Coins, BookOpen, Radio, Sparkles, FileSpreadsheet, ShieldCheck, Library, UserPlus, Award, ClipboardCheck, Gift, Activity, Shield, FileText, Tablet, Palette, UtensilsCrossed, Clock } from "lucide-react";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";

const items = [
  { key: "stations" as const, icon: Users },
  { key: "compliance" as const, icon: Scale },
] as const;

export default async function ManagerSettingsPage({
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200/80 px-4 py-4 dark:border-white/10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display-title text-xl font-bold tracking-tight">{dict.settings.manager}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.settings.managerDesc}</p>
          </div>
          <Link
            href={`/${lang}/dashboard`}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {dict.nav.cockpit}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <nav className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col lg:gap-1">
          <Link
            href={`/${lang}/settings`}
            className="rounded-full px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5"
          >
            {dict.settings.general}
          </Link>
          <Link
            href={`/${lang}/settings/manager`}
            className="rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            {dict.settings.manager}
          </Link>
          {user.role === "ADMIN" && (
            <Link
              href={`/${lang}/settings/admin`}
              className="rounded-full px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5"
            >
              {dict.settings.admin}
            </Link>
          )}
        </nav>

        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
          <Link
            href={`/${lang}/settings/manager/stations`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Users className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.stations.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.stations.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/assiduity`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <ClipboardList className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.assiduity.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.assiduity.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/punches`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Clock className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.punches.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.punches.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/onboarding`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <UserPlus className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.integration.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.integration.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/skills`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Award className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.skills.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.skills.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/reviews`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <ClipboardCheck className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.reviews.managerTitle}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.reviews.managerSubtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/benefits`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Gift className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.benefits.managerTitle}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.benefits.managerSubtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/convention`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <FileText className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.convention.manager.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.convention.manager.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/brand`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Palette className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Marque & parcours</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Couleur enseigne, accueil et déverrouillage J1–J5
            </p>
          </Link>

          <Link
            href={`/${lang}/tablet`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Tablet className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Tablette plancher</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Plancher, coaching, formations, alertes et NIP
            </p>
          </Link>

          <Link
            href={`/${lang}/demo/franchise`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">Mode démo franchise</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Pitch investisseur · scrubber J1–J5
            </p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/culture`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Shield className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.culture.managerTitle}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.culture.managerSubtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/pulse`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Activity className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.pulse.managerTitle}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.pulse.managerSubtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/tips`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Coins className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.tips.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.tips.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/sops`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <BookOpen className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.sops.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.sops.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/food-cost`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <UtensilsCrossed className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.foodCost.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.foodCost.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/pos`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Radio className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.pos.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.pos.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/staffing`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.staffing.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.staffing.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/payroll`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.payroll.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.payroll.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/audit`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <ShieldCheck className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.audit.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.audit.subtitle}</p>
          </Link>

          <Link
            href={`/${lang}/settings/manager/arsi`}
            className="premium-card card-lift p-5 transition-colors hover:border-accent/30"
          >
            <Library className="h-5 w-5 text-accent" aria-hidden />
            <h2 className="mt-3 text-base font-semibold">{dict.manager.arsi.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.arsi.subtitle}</p>
          </Link>

          {items.filter(({ key }) => key !== "stations").map(({ key, icon: Icon }) => (
            <article
              key={key}
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <Icon className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="mt-3 text-base font-semibold">{dict.settings[key]}</h2>
              <p className="mt-1 text-sm text-foreground-muted">{dict.settings.comingSoon}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

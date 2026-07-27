import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Settings,
  Shield,
  Users,
  Bot,
  Scale,
  CreditCard,
  CalendarClock,
  UserRound,
  LifeBuoy,
  LayoutDashboard,
  ArrowRight,
  FileText,
  Clock,
  Coins,
  BookOpen,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { canAccessAdminSettings, canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { UserAvatar } from "@/components/ui/user-avatar";

const adminItems = [
  { key: "users", icon: Users },
  { key: "agents", icon: Bot },
  { key: "billing", icon: CreditCard },
] as const;

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  const role = user?.role ?? "EMPLOYEE";
  const showManager = canAccessManagerSettings(role);
  const showAdmin = canAccessAdminSettings(role);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200/80 px-4 py-4 dark:border-white/10 sm:px-6">
        <h1 className="display-title text-xl font-bold tracking-tight">{dict.settings.title}</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <nav className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:w-48 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          <Link
            href={`/${lang}/settings`}
            className="shrink-0 rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            {dict.settings.general}
          </Link>
          {showManager && (
            <Link
              href={`/${lang}/dashboard`}
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-semibold text-accent hover:bg-accent-muted"
            >
              {dict.nav.cockpit}
            </Link>
          )}
          <Link
            href={`/${lang}/settings/profile`}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
          >
            {dict.settings.profile}
          </Link>
          <Link
            href={`/${lang}/settings/availability`}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
          >
            {dict.settings.availability}
          </Link>
          <Link
            href={`/${lang}/help`}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
          >
            {dict.settings.help}
          </Link>
          {showManager && (
            <Link
              href={`/${lang}/settings/manager`}
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
            >
              {dict.settings.manager}
            </Link>
          )}
          {showAdmin && (
            <Link
              href={`/${lang}/settings/admin`}
              className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-foreground-muted hover:bg-surface-muted"
            >
              {dict.settings.admin}
            </Link>
          )}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {user && (
            <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
              <div className="flex items-center gap-3">
                <UserAvatar
                  fullName={user.fullName}
                  pictureUrl={user.profilePictureUrl}
                  stationColorHex={user.stationColorHex}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-foreground-muted" aria-hidden />
                    <h2 className="text-base font-semibold">{dict.profile.title}</h2>
                  </div>
                  <p className="mt-1 text-sm text-foreground-muted">{dict.profile.subtitle}</p>
                  <Link
                    href={`/${lang}/settings/profile`}
                    className="mt-3 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {dict.profile.managePhoto} →
                  </Link>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
            <h2 className="text-base font-semibold">{dict.settings.appearance}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{dict.settings.themeSystem}</p>
            <div className="mt-4">
              <ThemeToggle
                labels={{
                  themeLight: dict.settings.themeLight,
                  themeDark: dict.settings.themeDark,
                  themeSystem: dict.settings.themeSystem,
                }}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
            <h2 className="text-base font-semibold">{dict.settings.language}</h2>
            <div className="mt-4">
              <LanguageSwitcher lang={lang} />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-foreground-muted" aria-hidden />
              <h2 className="text-base font-semibold">{dict.settings.availability}</h2>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{dict.availability.subtitle}</p>
            <Link
              href={`/${lang}/settings/availability`}
              className="mt-4 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {dict.availability.title} →
            </Link>
          </section>

          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-foreground-muted" aria-hidden />
              <h2 className="text-base font-semibold">{dict.convention.pageTitle}</h2>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{dict.convention.pageSubtitle}</p>
            <Link
              href={`/${lang}/convention`}
              className="mt-4 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {dict.convention.pageTitle} →
            </Link>
          </section>

          <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-foreground-muted" aria-hidden />
              <h2 className="text-base font-semibold">{dict.settings.help}</h2>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">{dict.settings.helpDesc}</p>
            <Link
              href={`/${lang}/help`}
              className="mt-4 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {dict.help.title} →
            </Link>
          </section>

          {showManager && (
            <section className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-foreground-muted" aria-hidden />
                <h2 className="text-base font-semibold">{dict.settings.manager}</h2>
              </div>
              <p className="mt-1 text-sm text-foreground-muted">{dict.settings.managerDesc}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/${lang}/dashboard`}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  {dict.nav.cockpit}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href={`/${lang}/settings/manager`}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200/80 bg-white px-4 py-2.5 text-sm font-medium text-foreground hover:bg-zinc-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5"
                >
                  {dict.opsDashboard.openModules}
                </Link>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                <li>
                  <Link
                    href={`/${lang}/settings/manager/stations`}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 hover:border-accent/30"
                  >
                    <Users className="h-4 w-4 text-accent" aria-hidden />
                    <p className="text-sm font-medium">{dict.settings.stations}</p>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${lang}/settings/manager/assiduity`}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 hover:border-accent/30"
                  >
                    <Scale className="h-4 w-4 text-accent" aria-hidden />
                    <p className="text-sm font-medium">{dict.manager.assiduity.title}</p>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${lang}/settings/manager/punches`}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 hover:border-accent/30"
                  >
                    <Clock className="h-4 w-4 text-accent" aria-hidden />
                    <p className="text-sm font-medium">{dict.manager.punches.title}</p>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${lang}/settings/manager/tips`}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 hover:border-accent/30"
                  >
                    <Coins className="h-4 w-4 text-accent" aria-hidden />
                    <p className="text-sm font-medium">{dict.manager.tips.title}</p>
                  </Link>
                </li>
                <li>
                  <Link
                    href={`/${lang}/sops`}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface/80 px-4 py-3 hover:border-accent/30"
                  >
                    <BookOpen className="h-4 w-4 text-accent" aria-hidden />
                    <p className="text-sm font-medium">{dict.manager.sops.title}</p>
                  </Link>
                </li>
              </ul>
            </section>
          )}

          {showAdmin && (
            <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-foreground-muted" aria-hidden />
                <h2 className="text-base font-semibold">{dict.settings.admin}</h2>
              </div>
              <p className="mt-1 text-sm text-foreground-muted">{dict.settings.adminDesc}</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {adminItems.map(({ key, icon: Icon }) => (
                  <li
                    key={key}
                    className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-muted px-4 py-3"
                  >
                    <Icon className="h-4 w-4 text-foreground-muted" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">{dict.settings[key]}</p>
                      <p className="text-xs text-foreground-muted">{dict.settings.comingSoon}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

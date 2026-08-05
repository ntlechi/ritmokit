import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DoorOpen,
  FileSpreadsheet,
  FileText,
  Gift,
  Music2,
  Palette,
  Plug,
  Shield,
  Tablet,
  UserPlus,
  Users,
  Award,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { dna } from "@/lib/design/dna";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { StudioSetupHubPill } from "@/components/studio/studio-setup-checklist";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getStudioSetupStatus } from "@/lib/data/studio-setup";
import { safeQuery } from "@/lib/data/safe";
import { cn } from "@/lib/utils";

type HubLink = {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

function HubCard({ href, icon: Icon, title, subtitle }: HubLink) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-surface p-5 shadow-xs transition hover:border-accent/40 hover:shadow-sm"
    >
      <Icon className="h-5 w-5 text-accent" aria-hidden />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
    </Link>
  );
}

function HubGroup({
  label,
  links,
}: {
  label: string;
  links: HubLink[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-accent">{label}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{links.map((link) => <HubCard key={link.href} {...link} />)}</div>
    </section>
  );
}

function buildGroups(lang: Locale, dict: Dictionary): { label: string; links: HubLink[] }[] {
  return [
    {
      label: dict.settings.hubStudio,
      links: [
        {
          href: `/${lang}/sessions`,
          icon: Music2,
          title: dict.nav.sessions,
          subtitle: dict.dance.sessionsIntro,
        },
        {
          href: `/${lang}/rooms`,
          icon: DoorOpen,
          title: dict.nav.rooms,
          subtitle: dict.dance.roomsIntro,
        },
        {
          href: `/${lang}/accueil`,
          icon: Tablet,
          title: dict.nav.accueil,
          subtitle: dict.settings.hubAccueilDesc,
        },
        {
          href: `/${lang}/settings/manager/stations`,
          icon: Users,
          title: dict.manager.stations.title,
          subtitle: dict.manager.stations.subtitle,
        },
      ],
    },
    {
      label: dict.settings.hubPeople,
      links: [
        {
          href: `/${lang}/team`,
          icon: Users,
          title: dict.team.title,
          subtitle: dict.team.intro,
        },
        {
          href: `/${lang}/settings/manager/payroll`,
          icon: FileSpreadsheet,
          title: dict.manager.payroll.title,
          subtitle: dict.manager.payroll.subtitle,
        },
        {
          href: `/${lang}/settings/manager/onboarding`,
          icon: UserPlus,
          title: dict.manager.integration.title,
          subtitle: dict.manager.integration.subtitle,
        },
      ],
    },
    {
      label: dict.settings.hubCulture,
      links: [
        {
          href: `/${lang}/settings/manager/culture`,
          icon: Shield,
          title: dict.culture.managerTitle,
          subtitle: dict.culture.managerSubtitle,
        },
        {
          href: `/${lang}/settings/manager/convention`,
          icon: FileText,
          title: dict.convention.manager.title,
          subtitle: dict.convention.manager.subtitle,
        },
        {
          href: `/${lang}/settings/manager/pulse`,
          icon: Activity,
          title: dict.pulse.managerTitle,
          subtitle: dict.pulse.managerSubtitle,
        },
        {
          href: `/${lang}/settings/manager/brand`,
          icon: Palette,
          title: dict.settings.hubBrand,
          subtitle: dict.settings.hubBrandDesc,
        },
        {
          href: `/${lang}/settings/manager/integrations`,
          icon: Plug,
          title: dict.settings.hubIntegrations,
          subtitle: dict.settings.hubIntegrationsDesc,
        },
      ],
    },
    {
      label: dict.settings.hubMore,
      links: [
        {
          href: `/${lang}/settings/manager/assiduity`,
          icon: ClipboardList,
          title: dict.manager.assiduity.title,
          subtitle: dict.manager.assiduity.subtitle,
        },
        {
          href: `/${lang}/settings/manager/punches`,
          icon: Clock,
          title: dict.manager.punches.title,
          subtitle: dict.manager.punches.subtitle,
        },
        {
          href: `/${lang}/settings/manager/skills`,
          icon: Award,
          title: dict.manager.skills.title,
          subtitle: dict.manager.skills.subtitle,
        },
        {
          href: `/${lang}/settings/manager/reviews`,
          icon: ClipboardCheck,
          title: dict.reviews.managerTitle,
          subtitle: dict.reviews.managerSubtitle,
        },
        {
          href: `/${lang}/settings/manager/benefits`,
          icon: Gift,
          title: dict.benefits.managerTitle,
          subtitle: dict.benefits.managerSubtitle,
        },
        {
          href: `/${lang}/sops`,
          icon: BookOpen,
          title: dict.manager.sops.title,
          subtitle: dict.manager.sops.subtitle,
        },
      ],
    },
  ];
}

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

  const { data: setupStatus } = await safeQuery(
    () => getStudioSetupStatus(user.id, user.role),
    null,
  );

  const groups = buildGroups(lang, dict);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {dict.settings.hubBadge}
            </p>
            <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
              {dict.settings.manager}
            </h1>
            <p className={dna.subtitle}>{dict.settings.managerDesc}</p>
          </div>
          <Link href={`/${lang}/dashboard`} className={dna.cta}>
            {dict.nav.cockpit}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <nav className="flex shrink-0 gap-2 overflow-x-auto lg:w-48 lg:flex-col lg:gap-1">
          <Link href={`/${lang}/settings`} className={dna.navIdle}>
            {dict.settings.general}
          </Link>
          <Link href={`/${lang}/settings/manager`} className={dna.navActive}>
            {dict.settings.manager}
          </Link>
          {user.role === "ADMIN" && (
            <Link href={`/${lang}/settings/admin`} className={dna.navIdle}>
              {dict.settings.admin}
            </Link>
          )}
        </nav>

        <div className={cn("min-w-0 flex-1 space-y-8")}>
          {setupStatus && (
            <StudioSetupHubPill dict={dict} lang={lang} status={setupStatus} />
          )}
          {groups.map((group) => (
            <HubGroup key={group.label} label={group.label} links={group.links} />
          ))}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Users } from "lucide-react";
import { ManagerOnboardingDashboardView } from "@/components/manager/manager-onboarding-dashboard";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getFeedbackTrendsForEmployees } from "@/lib/data/feedback";
import { getManagerOnboardingDashboard } from "@/lib/data/hr-excellence";
import { getTeamRosterForUser } from "@/lib/data/team";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerOnboardingPage({
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

  const [{ data: dashboard, dbError }, { data: roster }] = await Promise.all([
    safeQuery(() => getManagerOnboardingDashboard(user.id), null),
    safeQuery(() => getTeamRosterForUser(user.id, user.role), null),
  ]);

  const buddyCandidates =
    roster?.members
      .filter((m) => m.user.role === "EMPLOYEE" || m.user.role === "MANAGER")
      .map((m) => ({ userId: m.userId, fullName: m.user.fullName })) ?? [];

  const recruitIds = dashboard?.recruits.map((r) => r.userId) ?? [];
  const { data: feedbackTrends } = await safeQuery(
    () =>
      dashboard
        ? getFeedbackTrendsForEmployees(recruitIds, dashboard.locationId)
        : Promise.resolve(new Map()),
    new Map(),
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
          <Users className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.manager.integration.title}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.manager.integration.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {dbError && <DbErrorBanner label={dict.manager.integration.errors.databaseError} />}
        {dashboard && (
          <ManagerOnboardingDashboardView
            data={dashboard}
            buddyCandidates={buddyCandidates}
            feedbackTrends={feedbackTrends ?? undefined}
            dict={dict}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

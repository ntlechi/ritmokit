import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { PageBodyFallback } from "@/components/errors/page-body-fallback";
import { TeamRoster } from "@/components/team/team-roster";
import { dna } from "@/lib/design/dna";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { safeQuery } from "@/lib/data/safe";
import { getTeamRosterForUser } from "@/lib/data/team";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale } from "@/lib/i18n/config";
import type { Role } from "@/generated/prisma/enums";

export default async function TeamPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }

  const canManage = canAccessManagerSettings(user.role);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Users className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                {dict.team.badge}
              </p>
              <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
                {dict.team.title}
              </h1>
              <p className={dna.subtitle}>{dict.team.intro}</p>
            </div>
          </div>
          {canManage && (
            <Link href={`/${lang}/team/requests`} className={dna.ctaGhost}>
              <ClipboardList className="h-4 w-4 text-accent" aria-hidden />
              {dict.team.requests}
            </Link>
          )}
        </div>
      </header>

      <Suspense fallback={<PageBodyFallback label={dict.team.title} />}>
        <TeamRosterBody
          lang={lang}
          dict={dict}
          userId={user.id}
          role={user.role}
          canManage={canManage}
          canOwner={user.role === "OWNER" || user.role === "ADMIN"}
        />
      </Suspense>
    </div>
  );
}

async function TeamRosterBody({
  lang,
  dict,
  userId,
  role,
  canManage,
  canOwner,
}: {
  lang: Locale;
  dict: Dictionary;
  userId: string;
  role: Role;
  canManage: boolean;
  canOwner: boolean;
}) {
  const { data: roster, dbError } = await safeQuery(
    () => getTeamRosterForUser(userId, role),
    null,
  );

  if (dbError) {
    return (
      <div className="flex flex-1 flex-col p-4 sm:p-6">
        <DbErrorBanner label={dict.common.dbDisconnected} />
      </div>
    );
  }

  if (!roster) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
          {dict.team.emptyRoster}
        </p>
      </main>
    );
  }

  return (
    <TeamRoster
      lang={lang}
      dict={dict}
      roster={roster}
      currentUserId={userId}
      canManage={canManage}
      canOwner={canOwner}
      hideChromeHeader
    />
  );
}

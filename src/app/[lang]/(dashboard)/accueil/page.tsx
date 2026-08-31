import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { AccueilRosterView } from "@/components/accueil/accueil-roster";
import { InscriptionConcierge } from "@/components/accueil/inscription-concierge";
import { AgentActionRail } from "@/components/accueil/agent-action-rail";
import { DbErrorBanner } from "@/components/db-error-banner";
import { dna } from "@/lib/design/dna";
import { canAccessAccueil, getSessionUser } from "@/lib/auth/session";
import { getAccueilRosterForUser } from "@/lib/data/accueil-roster";
import { getOpenDanceAgentActionsForLocation } from "@/lib/dance/agent-actions";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function AccueilPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessAccueil(user.role)) redirect(`/${lang}/dashboard`);

  const { data: roster, dbError } = await safeQuery(
    () => getAccueilRosterForUser(user.id, { locale: lang }),
    null,
  );

  const sessionIds = roster?.classes.map((c) => c.sessionId) ?? [];
  const { data: agentActions } = await safeQuery(
    async () => {
      if (!roster) return [];
      return getOpenDanceAgentActionsForLocation(roster.locationId, {
        sessionIds,
        limit: 20,
      });
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="flex w-full flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <ClipboardCheck className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {dict.accueil.lineupBadge}
            </p>
            <h1 className="display-title text-xl font-bold tracking-tight sm:text-2xl">
              {dict.accueil.title}
            </h1>
            <p className={dna.subtitle}>{dict.accueil.subtitle}</p>
          </div>
          <Link
            href={`/${lang}/help/feuille-accueil`}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold hover:bg-surface-muted print:hidden"
          >
            {dict.accueil.cheatSheetLink}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
        {dbError && <DbErrorBanner label={dict.manager.stations.errors.databaseError} />}
        {agentActions && agentActions.length > 0 && (
          <AgentActionRail actions={agentActions} lang={lang} dict={dict} />
        )}
        {roster && (
          <InscriptionConcierge locationId={roster.locationId} dict={dict} />
        )}
        {roster && (
          <AccueilRosterView
            initial={roster}
            lang={lang}
            dict={dict}
            prioritizeUnpaid={
              Boolean(agentActions?.some((a) => a.uiKind === "unpaid_promote")) ||
              (roster.classes.some((c) => c.unpaidCount > 0) &&
                roster.classes.some((c) =>
                  c.roster.some((r) => r.promotedUnpaid),
                ))
            }
          />
        )}
      </div>
    </div>
  );
}

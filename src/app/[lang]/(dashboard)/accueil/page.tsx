import { notFound, redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { AccueilRosterView } from "@/components/accueil/accueil-roster";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessAccueil, getSessionUser } from "@/lib/auth/session";
import { getAccueilRosterForUser } from "@/lib/data/accueil-roster";
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="display-title text-xl font-bold tracking-tight">
              {dict.accueil.title}
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.accueil.subtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
        {dbError && <DbErrorBanner label={dict.manager.stations.errors.databaseError} />}
        {roster && <AccueilRosterView initial={roster} lang={lang} dict={dict} />}
      </div>
    </div>
  );
}

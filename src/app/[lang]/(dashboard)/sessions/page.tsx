import { notFound, redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { SessionsAdmin } from "@/components/dance/sessions-admin";
import { DbErrorBanner } from "@/components/db-error-banner";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getDanceAdminBundle } from "@/lib/data/dance-admin";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/dashboard`);

  const { data, dbError } = await safeQuery(() => getDanceAdminBundle(user.id, lang), null);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="display-title text-xl font-bold tracking-tight">{dict.nav.sessions}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.dance.sessionsIntro}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {dbError && <DbErrorBanner label={dict.dance.errors.generic} />}
        {data && <SessionsAdmin data={data} dict={dict} lang={lang} />}
      </div>
    </div>
  );
}

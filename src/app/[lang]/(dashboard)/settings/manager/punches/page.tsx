import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ManagerPunchesDashboard } from "@/components/manager/punches-dashboard";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getManagerPunchesForUser } from "@/lib/data/punch-admin";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerPunchesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) {
    return <div className="p-6 text-sm text-foreground-muted">{dict.common.loading}</div>;
  }
  if (!canAccessManagerSettings(user.role)) {
    redirect(`/${lang}/settings`);
  }

  const { data: result, dbError } = await safeQuery(
    () => getManagerPunchesForUser(user.id, user.role),
    null,
  );

  if (dbError || !result || !result.ok) {
    const errorLabel =
      result && !result.ok
        ? (dict.manager.punches.errors as Record<string, string>)[result.error] ??
          dict.manager.punches.errors.databaseError
        : dict.manager.punches.errors.databaseError;

    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{errorLabel}</p>
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
      </div>
    );
  }

  return <ManagerPunchesDashboard lang={lang} dict={dict} report={result.data} />;
}

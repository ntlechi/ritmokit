import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArsiHubDashboard } from "@/components/manager/arsi-hub-dashboard";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getArsiHubContextForManager } from "@/lib/data/arsi";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerArsiPage({ params }: { params: Promise<{ lang: string }> }) {
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
    () => getArsiHubContextForManager({ userId: user.id, userRole: user.role }),
    null,
  );

  if (dbError || !result) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.arsi.errors.databaseError}</p>
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.arsi.errors.unauthorized}</p>
        <Link href={`/${lang}/settings`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.title}
        </Link>
      </div>
    );
  }

  return (
    <ArsiHubDashboard
      lang={lang}
      dict={dict}
      organizationId={result.organizationId}
      organizationName={result.organizationName}
      locationName={result.locationName}
      syncHistory={result.syncHistory}
    />
  );
}

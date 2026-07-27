import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ManagerAuditDashboard } from "@/components/manager/audit-dashboard";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getAuditPackageHistoryForManager } from "@/lib/data/audit";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerAuditPage({ params }: { params: Promise<{ lang: string }> }) {
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
    () => getAuditPackageHistoryForManager({ userId: user.id, userRole: user.role }),
    null,
  );

  if (dbError || !result) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.audit.errors.databaseError}</p>
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.audit.errors.unauthorized}</p>
        <Link href={`/${lang}/settings`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.title}
        </Link>
      </div>
    );
  }

  return (
    <ManagerAuditDashboard
      lang={lang}
      dict={dict}
      locationName={result.locationName}
      packages={result.packages}
    />
  );
}

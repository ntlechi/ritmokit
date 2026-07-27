import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { CultureConstitutionEditor } from "@/components/culture/culture-constitution-editor";
import { CultureHealthView } from "@/components/culture/culture-health-view";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getCultureHealthDashboard, getEditableOrganizationValues } from "@/lib/data/culture";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function ManagerCulturePage({
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

  const [{ data: dashboard, dbError }, { data: editable }] = await Promise.all([
    safeQuery(() => getCultureHealthDashboard(user.id, user.role, lang), null),
    safeQuery(() => getEditableOrganizationValues(user.id, user.role), null),
  ]);

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
          <Shield className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{dict.culture.managerTitle}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{dict.culture.managerSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {dbError && <p className="text-sm text-danger">{dict.culture.errors.databaseError}</p>}

        {editable && editable.values.length > 0 && (
          <CultureConstitutionEditor values={editable.values} dict={dict} />
        )}

        {dashboard ? (
          <CultureHealthView dashboard={dashboard} dict={dict} lang={lang} hideConstitutionList />
        ) : (
          <p className="text-sm text-foreground-muted">{dict.culture.empty}</p>
        )}
      </div>
    </div>
  );
}

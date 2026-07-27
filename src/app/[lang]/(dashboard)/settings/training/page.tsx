import { notFound, redirect } from "next/navigation";
import { DbErrorBanner } from "@/components/db-error-banner";
import { TrainingCatalogManager } from "@/components/training/admin/training-catalog-manager";
import { canManageTrainingCatalog, getSessionUser } from "@/lib/auth/session";
import { safeQuery } from "@/lib/data/safe";
import { getTrainingCatalogAdmin } from "@/lib/data/training-catalog";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function TrainingCatalogPage({
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

  if (!canManageTrainingCatalog(user.role)) {
    redirect(`/${lang}/sops`);
  }

  const { data: result, dbError } = await safeQuery(
    () => getTrainingCatalogAdmin(user.id, user.role),
    null,
  );

  if (dbError || !result) {
    return (
      <div className="p-4 sm:p-6">
        <DbErrorBanner label={dict.manager.sops.errors.databaseError} />
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="p-4 sm:p-6">
        <DbErrorBanner label={dict.manager.sops.ownerOnly} />
      </div>
    );
  }

  return <TrainingCatalogManager catalog={result.data} lang={lang} dict={dict} />;
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FoodCostSettingsForm } from "@/components/manager/food-cost-settings-form";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getFoodCostSettings } from "@/lib/data/food-cost";
import { safeQuery } from "@/lib/data/safe";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

export default async function ManagerFoodCostPage({
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

  const { data: settings, dbError } = await safeQuery(
    () => getFoodCostSettings(user.id, user.role),
    null,
  );

  if (dbError || !settings) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">{dict.manager.foodCost.errors.databaseError}</p>
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <Link
          href={`/${lang}/settings/manager`}
          className="text-xs font-medium text-accent hover:underline"
        >
          ← {dict.settings.manager}
        </Link>
        <h1 className="display-title mt-2 text-xl font-bold tracking-tight">
          {dict.manager.foodCost.title}
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">{dict.manager.foodCost.subtitle}</p>
      </header>
      <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
        <FoodCostSettingsForm settings={settings} dict={dict} lang={lang} />
      </div>
    </div>
  );
}

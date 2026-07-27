import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandSettingsForm } from "@/components/manager/brand-settings-form";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getOrgBrandSettings } from "@/lib/data/org-brand";
import { safeQuery } from "@/lib/data/safe";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function ManagerBrandPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/settings`);

  const { data: result, dbError } = await safeQuery(
    () => getOrgBrandSettings(user.id, user.role),
    null,
  );

  if (dbError || !result || !result.ok) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <p className="text-sm text-danger">Impossible de charger le kit de marque.</p>
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="display-title text-xl font-bold tracking-tight">Marque & parcours</h1>
            <p className="mt-1 text-sm text-foreground-muted">
              Brand kit franchise + déverrouillage des modules d&apos;onboarding
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/${lang}/demo/franchise`}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground-muted"
            >
              Mode démo
            </Link>
            <Link
              href={`/${lang}/tablet`}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              Tablette
            </Link>
          </div>
        </div>
      </header>
      <div className="w-full flex-1 px-4 py-6 sm:px-6">
        <BrandSettingsForm settings={result.data} />
      </div>
    </div>
  );
}

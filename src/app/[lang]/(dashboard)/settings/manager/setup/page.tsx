import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StudioSetupChecklist } from "@/components/studio/studio-setup-checklist";
import { HelpStepMockup } from "@/components/help/help-step-mockup";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";
import { getStudioSetupStatus } from "@/lib/data/studio-setup";
import { safeQuery } from "@/lib/data/safe";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const dynamic = "force-dynamic";

export default async function StudioSetupPage({
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

  const { data: status } = await safeQuery(() => getStudioSetupStatus(user.id, user.role), null);
  if (!status) redirect(`/${lang}/settings/manager`);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <Link
          href={`/${lang}/settings/manager`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {dict.settings.manager}
        </Link>

        <StudioSetupChecklist dict={dict} lang={lang as Locale} status={status} />

        <section className="premium-card p-5">
          <h2 className="text-sm font-bold">{dict.help.studioSetup.visualsTitle}</h2>
          <p className="mt-1 text-xs text-foreground-muted">{dict.help.studioSetup.visualsSubtitle}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <HelpStepMockup variant="paypal" caption={dict.help.mockups.paypal} />
            <HelpStepMockup variant="season" caption={dict.help.mockups.season} />
            <HelpStepMockup variant="accueil-tap" caption={dict.help.mockups.accueilTap} />
          </div>
        </section>
      </div>
    </div>
  );
}

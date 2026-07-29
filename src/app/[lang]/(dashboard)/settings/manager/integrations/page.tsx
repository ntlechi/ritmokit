import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IntegrationsPayPalForm } from "@/components/manager/integrations-paypal-form";
import { dna } from "@/lib/design/dna";
import { getPayPalIntegrationSettings } from "@/lib/data/integrations";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isLocale } from "@/lib/i18n/config";
import { canAccessManagerSettings, getSessionUser } from "@/lib/auth/session";

export default async function ManagerIntegrationsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  if (!isLocale(raw)) notFound();
  const lang = raw;

  const [dict, user] = await Promise.all([getDictionary(lang), getSessionUser()]);
  if (!user) redirect(`/${lang}/login`);
  if (!canAccessManagerSettings(user.role)) redirect(`/${lang}/settings`);

  const result = await getPayPalIntegrationSettings(user.id, user.role);
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`/${lang}/settings/manager`} className="mt-4 text-sm text-accent hover:underline">
          ← {dict.settings.manager}
        </Link>
        <p className="mt-6 text-sm text-foreground-muted">{dict.settings.integrationsNotFound}</p>
      </div>
    );
  }

  const t = dict.settings;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Link href={`/${lang}/settings/manager`} className={dna.navIdle}>
          ← {dict.settings.manager}
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
          {t.hubIntegrations}
        </p>
        <h1 className="display-title mt-1 text-2xl font-bold tracking-tight">
          {t.integrationsTitle}
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">{t.integrationsIntro}</p>
      </div>

      <IntegrationsPayPalForm
        settings={result.data}
        labels={{
          title: t.integrationsPaypalTitle,
          subtitle: t.integrationsPaypalSubtitle,
          status: t.integrationsStatus,
          mode: t.integrationsMode,
          modeSandbox: t.integrationsModeSandbox,
          modeLive: t.integrationsModeLive,
          clientId: t.integrationsClientId,
          clientSecret: t.integrationsClientSecret,
          clientSecretKeep: t.integrationsClientSecretKeep,
          webhookId: t.integrationsWebhookId,
          webhookUrl: t.integrationsWebhookUrl,
          origins: t.integrationsOrigins,
          originsHint: t.integrationsOriginsHint,
          save: t.integrationsSave,
          test: t.integrationsTest,
          disconnect: t.integrationsDisconnect,
          envFallback: t.integrationsEnvFallback,
          saved: t.integrationsSaved,
          tested: t.integrationsTested,
          disconnected: t.integrationsDisconnected,
          errorGeneric: t.integrationsError,
          copy: t.integrationsCopy,
          copied: t.integrationsCopied,
        }}
      />
    </div>
  );
}

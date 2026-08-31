"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectPayPalIntegrationAction,
  savePayPalIntegrationAction,
  testPayPalIntegrationAction,
} from "@/lib/actions/integrations";
import type { PayPalIntegrationView } from "@/lib/data/integrations";
import { Button } from "@/components/ui/button";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

type Labels = {
  title: string;
  subtitle: string;
  status: string;
  mode: string;
  modeSandbox: string;
  modeLive: string;
  clientId: string;
  clientSecret: string;
  clientSecretKeep: string;
  webhookId: string;
  webhookUrl: string;
  origins: string;
  originsHint: string;
  save: string;
  test: string;
  disconnect: string;
  envFallback: string;
  saved: string;
  tested: string;
  disconnected: string;
  errorGeneric: string;
  copy: string;
  copied: string;
};

const STATUS_STYLE: Record<string, string> = {
  CONNECTED: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  TESTING: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
  DISCONNECTED: "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30",
  ERROR: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
};

export function IntegrationsPayPalForm({
  settings,
  labels,
}: {
  settings: PayPalIntegrationView;
  labels: Labels;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookId, setWebhookId] = useState("");
  const [mode, setMode] = useState<"sandbox" | "live">(settings.mode);
  const [origins, setOrigins] = useState(settings.allowedOrigins.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setIsError(true);
        setMessage(labels.errorGeneric);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="premium-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{labels.title}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{labels.subtitle}</p>
            <p className="mt-2 text-xs text-foreground-muted">{settings.organizationName}</p>
          </div>
          <span
            className={cn(
              "inline-flex rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide",
              STATUS_STYLE[settings.status] ?? STATUS_STYLE.DISCONNECTED,
            )}
          >
            {labels.status}: {settings.status}
          </span>
        </div>

        {settings.lastError ? (
          <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {settings.lastError}
          </p>
        ) : null}

        {settings.envFallbackAvailable ? (
          <p className="mt-3 text-xs text-amber-200/90">{labels.envFallback}</p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{labels.mode}</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value === "live" ? "live" : "sandbox")}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm"
            >
              <option value="sandbox">{labels.modeSandbox}</option>
              <option value="live">{labels.modeLive}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{labels.clientId}</span>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={settings.clientIdMasked || "Ae…"}
              autoComplete="off"
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{labels.clientSecret}</span>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={settings.hasClientSecret ? "••••••••" : ""}
              autoComplete="new-password"
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-sm"
            />
            {settings.hasClientSecret ? (
              <span className="text-xs text-foreground-muted">{labels.clientSecretKeep}</span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{labels.webhookId}</span>
            <input
              value={webhookId}
              onChange={(e) => setWebhookId(e.target.value)}
              placeholder={settings.webhookIdMasked || ""}
              autoComplete="off"
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{labels.webhookUrl}</span>
            <div className="flex gap-2">
              <input
                readOnly
                value={settings.webhookUrl}
                className="min-w-0 flex-1 rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={!settings.webhookUrl}
                onClick={async () => {
                  if (!settings.webhookUrl) return;
                  await navigator.clipboard.writeText(settings.webhookUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? labels.copied : labels.copy}
              </Button>
            </div>
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">{labels.origins}</span>
            <textarea
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
              rows={3}
              placeholder="https://www.yourstudio.com"
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 font-mono text-sm"
            />
            <span className="text-xs text-foreground-muted">{labels.originsHint}</span>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await savePayPalIntegrationAction({
                  clientId,
                  clientSecret,
                  webhookId,
                  mode,
                  allowedOrigins: origins,
                  keepExistingSecret: true,
                });
                if (!result.ok) {
                  setIsError(true);
                  setMessage(result.error);
                  return;
                }
                setIsError(false);
                setMessage(labels.saved);
                setClientId("");
                setClientSecret("");
                setWebhookId("");
                router.refresh();
              })
            }
          >
            {labels.save}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            className={dna.ctaGhost}
            onClick={() =>
              run(async () => {
                const result = await testPayPalIntegrationAction();
                if (!result.ok) {
                  setIsError(true);
                  setMessage(result.error);
                  router.refresh();
                  return;
                }
                setIsError(false);
                setMessage(`${labels.tested} (${result.status})`);
                router.refresh();
              })
            }
          >
            {labels.test}
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={isPending}
            onClick={() =>
              run(async () => {
                const result = await disconnectPayPalIntegrationAction();
                if (!result.ok) {
                  setIsError(true);
                  setMessage(result.error);
                  return;
                }
                setIsError(false);
                setMessage(labels.disconnected);
                router.refresh();
              })
            }
          >
            {labels.disconnect}
          </Button>
        </div>

        {message ? (
          <p
            className={cn(
              "mt-4 text-sm",
              isError ? "text-rose-300" : "text-emerald-300",
            )}
          >
            {message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

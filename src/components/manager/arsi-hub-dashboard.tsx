"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, FileJson, Upload } from "lucide-react";
import { importArsiPayloadAction } from "@/lib/actions/arsi";
import type { ArsiSyncSummary } from "@/lib/data/arsi";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const SAMPLE_PLACEHOLDER = `{
  "organizationId": "…",
  "sops": [
    {
      "externalId": "arsi-latte-signature",
      "title": "Latte Signature Bati",
      "kind": "RECIPE",
      "stationSlug": "services",
      "summary": "Procédure standard de préparation.",
      "body": "# Latte Signature Bati\\n\\n## Étapes…",
      "version": 1,
      "isMandatory": true,
      "estimatedMinutes": 4,
      "steps": ["Mousse microtexture", "Double espresso", "Dressage"]
    }
  ]
}`;

function formatDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Toronto",
  }).format(new Date(iso));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function resolveError(dict: Dictionary, code: string) {
  const map = dict.manager.arsi.errors as Record<string, string>;
  return map[code] ?? dict.manager.arsi.errors.databaseError;
}

export function ArsiHubDashboard({
  lang,
  dict,
  organizationId,
  organizationName,
  locationName,
  syncHistory,
}: {
  lang: Locale;
  dict: Dictionary;
  organizationId: string;
  organizationName: string;
  locationName: string;
  syncHistory: ArsiSyncSummary[];
}) {
  const router = useRouter();
  const d = dict.manager.arsi;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    createdCount: number;
    updatedCount: number;
    invalidatedCount: number;
    opsCount: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setError(d.errors.invalidJson);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setJsonText(reader.result);
        setError(null);
      }
    };
    reader.readAsText(file);
  }

  function importPayload() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await importArsiPayloadAction(jsonText);
      if (!response.ok) {
        setError(resolveError(dict, response.error));
        return;
      }
      setResult({
        createdCount: response.createdCount,
        updatedCount: response.updatedCount,
        invalidatedCount: response.invalidatedCount,
        opsCount: response.opsCount,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href={`/${lang}/settings/manager`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-muted"
            aria-label={dict.settings.manager}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{d.title}</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              {organizationName} · {locationName} — {d.subtitle}
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" aria-hidden />
            <h2 className="text-base font-semibold">{d.payloadFormatTitle}</h2>
          </div>
          <p className="mt-1 text-xs text-foreground-muted">{d.payloadFormatHint}</p>
          <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs text-foreground-muted">
            {d.organizationLabel}: <span className="text-foreground">{organizationId}</span>
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <FileJson className="h-4 w-4 text-accent" aria-hidden />
              {d.pasteLabel}
            </span>
            <span className="text-xs text-foreground-muted">{d.pasteHint}</span>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              disabled={isPending}
              placeholder={SAMPLE_PLACEHOLDER}
              rows={14}
              spellCheck={false}
              className="mt-2 w-full resize-y rounded-xl border border-border bg-[#0a0f14] px-4 py-3 font-mono text-xs leading-relaxed text-[#c8e6d4] placeholder:text-[#4a6a58] disabled:opacity-60"
            />
          </label>

          <div
            className={`mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragOver ? "border-accent bg-accent/5" : "border-border bg-surface-muted/50"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <Upload className="mx-auto h-6 w-6 text-foreground-muted" aria-hidden />
            <p className="mt-2 text-sm font-medium">{d.uploadLabel}</p>
            <p className="mt-1 text-xs text-foreground-muted">{d.uploadHint}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              disabled={isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {d.uploadLabel}
            </Button>
          </div>

          {error && (
            <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4 space-y-2 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                <p className="text-sm font-semibold text-success">{d.resultTitle}</p>
              </div>
              <p className="text-xs text-foreground-muted">{d.resultOps.replace("{count}", String(result.opsCount))}</p>
              <ul className="space-y-1 text-xs text-foreground-muted">
                <li>{d.resultCreated.replace("{count}", String(result.createdCount))}</li>
                <li>{d.resultUpdated.replace("{count}", String(result.updatedCount))}</li>
                {result.invalidatedCount > 0 && (
                  <li className="font-medium text-warning">
                    {d.resultInvalidated.replace("{count}", String(result.invalidatedCount))}
                  </li>
                )}
              </ul>
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full sm:w-auto"
            disabled={isPending || jsonText.trim().length === 0}
            onClick={importPayload}
          >
            {isPending ? d.importing : d.importButton}
          </Button>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{d.historyTitle}</h2>
            <p className="mt-0.5 text-xs text-foreground-muted">{d.historySubtitle}</p>
          </div>

          {syncHistory.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-6 py-8 text-center text-sm text-foreground-muted">
              {d.noHistory}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-muted/60 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                      <th className="px-4 py-3">{d.colDate}</th>
                      <th className="px-4 py-3">{d.colImportedBy}</th>
                      <th className="px-4 py-3">{d.colOps}</th>
                      <th className="px-4 py-3">{d.colCreated}</th>
                      <th className="px-4 py-3">{d.colUpdated}</th>
                      <th className="px-4 py-3">{d.colInvalidated}</th>
                      <th className="px-4 py-3">{d.colPayloadSize}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {syncHistory.map((log) => (
                      <tr key={log.id} className="hover:bg-surface-muted/40">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(log.createdAt, lang)}</td>
                        <td className="px-4 py-3">{log.importedByName}</td>
                        <td className="px-4 py-3">
                          <Badge tone="accent">{log.opsCount}</Badge>
                        </td>
                        <td className="px-4 py-3 text-success">{log.createdCount}</td>
                        <td className="px-4 py-3">{log.updatedCount}</td>
                        <td className="px-4 py-3">
                          {log.invalidatedCount > 0 ? (
                            <span className="font-medium text-warning">{log.invalidatedCount}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-foreground-muted">{formatBytes(log.payloadSize)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

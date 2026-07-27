"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateModuleUnlockDaysAction,
  updateOrgBrandAction,
} from "@/lib/actions/org-brand";
import type { OrgBrandSettings } from "@/lib/data/org-brand";
import { Button } from "@/components/ui/button";

export function BrandSettingsForm({ settings }: { settings: OrgBrandSettings }) {
  const router = useRouter();
  const [name, setName] = useState(settings.name);
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const [welcomeCopy, setWelcomeCopy] = useState(settings.welcomeCopy);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl);
  const [unlockDays, setUnlockDays] = useState(
    Object.fromEntries(settings.modules.map((m) => [m.id, m.unlockDay])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function saveBrand() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateOrgBrandAction({
        name,
        primaryColor,
        welcomeCopy,
        logoUrl,
      });
      if (!result.ok) {
        setIsError(true);
        setMessage("Impossible d'enregistrer la marque.");
        return;
      }
      setIsError(false);
      setMessage("Marque enregistrée.");
      router.refresh();
    });
  }

  function saveUnlockDays() {
    setMessage(null);
    startTransition(async () => {
      const updates = settings.modules.map((m) => ({
        moduleId: m.id,
        unlockDay: Number(unlockDays[m.id] ?? m.unlockDay),
      }));
      const result = await updateModuleUnlockDaysAction(updates);
      if (!result.ok) {
        setIsError(true);
        setMessage("Impossible d'enregistrer les déverrouillages.");
        return;
      }
      setIsError(false);
      setMessage("Jours de déverrouillage enregistrés.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8" style={{ "--brand": primaryColor } as React.CSSProperties}>
      <section className="premium-card p-5">
        <h2 className="text-base font-semibold">Kit de marque</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Couleur, logo et message d&apos;accueil injectés dans l&apos;onboarding et la tablette.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-muted">Nom de l&apos;enseigne</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground-muted">Couleur primaire</span>
            <div className="flex gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm font-mono"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">URL logo (optionnel)</span>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-foreground-muted">Message d&apos;accueil</span>
            <textarea
              value={welcomeCopy}
              onChange={(e) => setWelcomeCopy(e.target.value)}
              rows={3}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm"
            />
          </label>
        </div>

        <div
          className="mt-4 rounded-xl border border-border p-4 text-white"
          style={{ background: primaryColor }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Aperçu</p>
          <p className="mt-1 text-xl font-black uppercase">{name || "Enseigne"}</p>
          <p className="mt-1 text-sm opacity-90">{welcomeCopy || "Message d'accueil…"}</p>
        </div>

        <Button className="mt-4" disabled={isPending} onClick={saveBrand}>
          Enregistrer la marque
        </Button>
      </section>

      <section className="premium-card p-5">
        <h2 className="text-base font-semibold">Déverrouillage modules J1–J5</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          0 = immédiat. 1–5 = disponible à partir du jour J relatif à l&apos;ancrage d&apos;intégration.
        </p>

        <ul className="mt-4 space-y-2">
          {settings.modules.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3"
            >
              <div>
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-[11px] text-foreground-muted">
                  {m.estimatedMinutes ? `${m.estimatedMinutes} min` : "Module onboarding"}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold">
                Jour
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={unlockDays[m.id] ?? 0}
                  onChange={(e) =>
                    setUnlockDays((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))
                  }
                  className="w-16 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-sm"
                />
              </label>
            </li>
          ))}
        </ul>

        {settings.modules.length === 0 && (
          <p className="mt-3 text-sm text-foreground-muted">Aucun module ONBOARDING actif.</p>
        )}

        <Button className="mt-4" disabled={isPending} onClick={saveUnlockDays}>
          Enregistrer les déverrouillages
        </Button>
      </section>

      {message && (
        <p className={`text-sm font-medium ${isError ? "text-danger" : "text-success"}`}>{message}</p>
      )}
    </div>
  );
}

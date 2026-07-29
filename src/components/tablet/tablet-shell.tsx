"use client";

import { useMemo, useState } from "react";
import {
  clampDemoDay,
  getDemoTabletSnapshot,
  resolveDemoPin,
  type DemoBrandKit,
} from "@/lib/demo/franchise-pitch";
import { NipPad } from "@/components/tablet/nip-pad";
import { FloorTab } from "@/components/tablet/floor-tab";
import { CoachingTab } from "@/components/tablet/coaching-tab";
import { TrainingTab } from "@/components/tablet/training-tab";
import { AlertsTab } from "@/components/tablet/alerts-tab";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

export type TabletTabId = "floor" | "coaching" | "training" | "alerts" | "kiosk";

const TABS: { id: TabletTabId; label: string }[] = [
  { id: "floor", label: "Plancher" },
  { id: "coaching", label: "Coaching" },
  { id: "training", label: "Formations" },
  { id: "alerts", label: "Alertes" },
  { id: "kiosk", label: "NIP" },
];

export function TabletShell({
  initialDay = 3,
  live = false,
  livePayload,
  locationId,
}: {
  initialDay?: number;
  live?: boolean;
  livePayload?: ReturnType<typeof getDemoTabletSnapshot> | null;
  locationId?: string;
}) {
  const [day, setDay] = useState(clampDemoDay(initialDay));
  const [tab, setTab] = useState<TabletTabId>("floor");
  const [punchFlash, setPunchFlash] = useState<string | null>(null);

  const snapshot = useMemo(
    () => (live && livePayload ? livePayload : getDemoTabletSnapshot(day)),
    [day, live, livePayload],
  );

  const brand = snapshot.brand;

  function onPinSubmit(pin: string) {
    if (live) return; // live handled by NipPad via action
    const emp = resolveDemoPin(pin);
    if (!emp) {
      setPunchFlash("NIP invalide — réessaie");
      return;
    }
    setPunchFlash(`Punch enregistré pour ${emp.fullName}`);
  }

  return (
    <div
      className="mx-auto flex min-h-[640px] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-lg"
      style={
        {
          "--brand": brand.primaryColor,
          "--brand-soft": `${brand.primaryColor}18`,
        } as React.CSSProperties
      }
    >
      <header className="dark flex items-center justify-between bg-background px-4 py-3 text-foreground">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white"
            style={{ background: brand.primaryColor }}
          >
            {brand.logoMark}
          </span>
          <p className="text-sm font-black tracking-wide uppercase" style={{ color: brand.primaryColor }}>
            {brand.name}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="text-foreground-muted">Vendredi 11:42</span>
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"
            style={{ background: brand.primaryColor }}
          >
            Quart midi
          </span>
        </div>
      </header>

      {!live && (
        <div className="flex items-center gap-2 border-b border-border bg-surface-muted/60 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
            Démo · Jour
          </span>
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[11px] font-black uppercase tracking-wide transition",
                day === d
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-surface text-foreground-muted hover:border-accent/40",
              )}
            >
              J{d}
            </button>
          ))}
        </div>
      )}

      <nav className={cn(dna.glass, "flex gap-1 border-b p-1.5")}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-full px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide transition sm:text-[11px]",
              tab === t.id ? dna.pillActive : cn(dna.pillIdle, "hover:bg-surface-muted"),
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div
        className={cn(
          "flex-1 overflow-y-auto p-3 sm:p-4",
          tab === "kiosk" ? "dark bg-background" : "bg-surface-muted",
        )}
      >
        {tab === "floor" && <FloorTab snapshot={snapshot} />}
        {tab === "coaching" && <CoachingTab snapshot={snapshot} />}
        {tab === "training" && <TrainingTab snapshot={snapshot} />}
        {tab === "alerts" && <AlertsTab snapshot={snapshot} />}
        {tab === "kiosk" && (
          <NipPad
            brand={brand as DemoBrandKit}
            demo={!live}
            locationId={locationId}
            onDemoSubmit={onPinSubmit}
            flash={punchFlash}
            onFlashClear={() => setPunchFlash(null)}
          />
        )}
      </div>
    </div>
  );
}

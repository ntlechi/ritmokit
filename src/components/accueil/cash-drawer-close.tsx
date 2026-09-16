"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, Lock, X } from "lucide-react";
import { closeCashDrawerAction } from "@/lib/actions/cash-drawer";
import type { DrawerSnapshot } from "@/lib/data/cash-drawer";
import { dna } from "@/lib/design/dna";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const TOLERANCE_CAD = 5;
const FLOAT_STORAGE_KEY = "ritmokit-drawer-float";

function money(value: number, lang: Locale) {
  return new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(value);
}

function timeLabel(iso: string, lang: Locale) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-CA" : "fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && raw.trim() !== "" ? Math.round(n * 100) / 100 : null;
}

/**
 * Compact "Caisse ce soir" strip for the door toolbar + the 60-second
 * end-of-night close modal. Cash is the only thing in the drawer; Interac is
 * shown for context and never enters the arithmetic.
 */
export function CashDrawerPanel({
  drawer,
  locationId,
  lang,
  dict,
  onClosed,
}: {
  drawer: DrawerSnapshot;
  locationId: string;
  lang: Locale;
  dict: Dictionary["accueil"];
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const closed = drawer.closed;

  return (
    <>
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-surface-muted/40 px-4 py-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
          <Banknote className="h-3.5 w-3.5" aria-hidden />
          {dict.drawerTitle}
        </p>
        <p className="font-mono text-sm tabular-nums">
          <span className="font-bold text-foreground">{money(drawer.cashCad, lang)}</span>{" "}
          <span className="text-foreground-muted">
            {dict.drawerCash} · {drawer.cashCount} {dict.drawerEntries}
          </span>
        </p>
        <p className="font-mono text-sm tabular-nums text-foreground-muted">
          {money(drawer.interacCad, lang)} {dict.drawerInterac} · {drawer.interacCount}{" "}
          <span className="text-[11px] uppercase">({dict.drawerInteracNote})</span>
        </p>
        <div className="ml-auto">
          {closed ? (
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-yield/30 bg-yield/10 px-3 text-xs font-bold text-yield">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {dict.drawerAlreadyClosed.replace("{time}", timeLabel(closed.closedAt, lang))}
            </span>
          ) : (
            <button
              type="button"
              data-interactive
              onClick={() => setOpen(true)}
              className={cn(dna.ctaGhost, "min-h-12 text-sm font-semibold")}
            >
              <Lock className="h-4 w-4" aria-hidden />
              {dict.drawerClose}
            </button>
          )}
        </div>
      </div>
      {open && !closed ? (
        <CashDrawerCloseModal
          drawer={drawer}
          locationId={locationId}
          lang={lang}
          dict={dict}
          onCancel={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onClosed();
          }}
        />
      ) : null}
    </>
  );
}

function CashDrawerCloseModal({
  drawer,
  locationId,
  lang,
  dict,
  onCancel,
  onDone,
}: {
  drawer: DrawerSnapshot;
  locationId: string;
  lang: Locale;
  dict: Dictionary["accueil"];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [floatRaw, setFloatRaw] = useState(() => {
    if (typeof window === "undefined") return "100";
    return localStorage.getItem(FLOAT_STORAGE_KEY) ?? "100";
  });
  const [countedRaw, setCountedRaw] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ depositCad: number } | null>(null);
  const countedRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countedRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const startFloat = parseAmount(floatRaw);
  const counted = parseAmount(countedRaw);
  const expected = startFloat == null ? null : Math.round((startFloat + drawer.cashCad) * 100) / 100;
  const variance =
    expected == null || counted == null ? null : Math.round((counted - expected) * 100) / 100;
  const deposit =
    startFloat == null || counted == null ? null : Math.max(0, Math.round((counted - startFloat) * 100) / 100);

  const varianceState = useMemo(() => {
    if (variance == null) return "idle" as const;
    if (Math.abs(variance) < 0.005) return "ok" as const;
    if (Math.abs(variance) <= TOLERANCE_CAD) return "tolerated" as const;
    return "over" as const;
  }, [variance]);

  const noteRequired = varianceState === "over";
  const canSubmit =
    !busy && startFloat != null && counted != null && (!noteRequired || note.trim().length > 0);

  async function submit() {
    if (!canSubmit || startFloat == null || counted == null) return;
    setBusy(true);
    setError(null);
    const result = await closeCashDrawerAction({
      locationId,
      startFloatCad: startFloat,
      countedCad: counted,
      note: note.trim(),
      lang,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "already_closed" && result.closedAt
          ? dict.drawerAlreadyClosed.replace("{time}", timeLabel(result.closedAt, lang))
          : result.error === "note_required"
            ? dict.drawerVarianceOver
            : dict.drawerError,
      );
      return;
    }
    localStorage.setItem(FLOAT_STORAGE_KEY, String(startFloat));
    setDone({ depositCad: result.depositCad });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-close-title"
        className={cn(dna.panelLg, "w-full max-w-lg p-5 sm:p-6")}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
              {dict.drawerTitle} · {drawer.businessDate}
            </p>
            <h2 id="drawer-close-title" className="mt-0.5 text-xl font-bold tracking-tight">
              {dict.drawerClose}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={cn(dna.iconBtn, "h-11 w-11")}
            aria-label={dict.walkInCancel}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {done ? (
          <div className="mt-5 space-y-3">
            <p className="rounded-xl bg-yield/10 px-3 py-2.5 text-sm font-medium text-yield" role="status">
              {dict.drawerDone}
            </p>
            <p className="text-sm text-foreground-muted">
              {dict.drawerDeposit.replace("{amount}", money(done.depositCad, lang))}
            </p>
            <button type="button" className={cn(dna.cta, "min-h-12 w-full")} onClick={onDone}>
              OK
            </button>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm tabular-nums">
              <dt className="text-foreground-muted">
                {dict.drawerCash} · {drawer.cashCount} {dict.drawerEntries}
              </dt>
              <dd className="text-right font-bold">{money(drawer.cashCad, lang)}</dd>
              <dt className="text-foreground-muted">
                {dict.drawerInterac} · {drawer.interacCount}{" "}
                <span className="text-[11px] uppercase">({dict.drawerInteracNote})</span>
              </dt>
              <dd className="text-right text-foreground-muted">{money(drawer.interacCad, lang)}</dd>
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-foreground-muted">{dict.drawerStartFloat}</span>
                <input
                  inputMode="decimal"
                  value={floatRaw}
                  onChange={(e) => setFloatRaw(e.target.value)}
                  className={cn(dna.field, "mt-1 min-h-12 font-mono text-base tabular-nums")}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-foreground-muted">{dict.drawerCounted}</span>
                <input
                  ref={countedRef}
                  inputMode="decimal"
                  value={countedRaw}
                  onChange={(e) => setCountedRaw(e.target.value)}
                  placeholder="0.00"
                  className={cn(dna.field, "mt-1 min-h-12 font-mono text-base tabular-nums")}
                  required
                />
              </label>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-surface-muted/50 px-4 py-3 font-mono text-sm tabular-nums">
              <dt className="text-foreground-muted">{dict.drawerExpected}</dt>
              <dd className="text-right">{expected == null ? "—" : money(expected, lang)}</dd>
              <dt className="text-foreground-muted">{dict.drawerVariance}</dt>
              <dd
                className={cn(
                  "text-right font-bold",
                  varianceState === "ok" && "text-yield",
                  varianceState === "tolerated" && "text-warning",
                  varianceState === "over" && "text-danger",
                )}
              >
                {variance == null ? "—" : `${variance > 0 ? "+" : ""}${money(variance, lang)}`}
              </dd>
            </dl>
            {varianceState !== "idle" ? (
              <p
                className={cn(
                  "mt-2 text-xs font-medium",
                  varianceState === "ok" && "text-yield",
                  varianceState === "tolerated" && "text-warning",
                  varianceState === "over" && "text-danger",
                )}
              >
                {varianceState === "ok"
                  ? dict.drawerVarianceOk
                  : varianceState === "tolerated"
                    ? dict.drawerVarianceTolerated
                    : dict.drawerVarianceOver}
              </p>
            ) : null}
            {deposit != null ? (
              <p className="mt-2 text-xs text-foreground-muted">
                {dict.drawerDeposit.replace("{amount}", money(deposit, lang))}
              </p>
            ) : null}

            {varianceState === "tolerated" || varianceState === "over" ? (
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-foreground-muted">{dict.drawerNote}</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  required={noteRequired}
                  className={cn(dna.field, "mt-1 min-h-12 resize-none")}
                />
              </label>
            ) : null}

            {error ? (
              <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="submit" disabled={!canSubmit} className={cn(dna.cta, "min-h-12 flex-1")}>
                <Lock className="h-4 w-4" aria-hidden />
                {dict.drawerSubmit}
              </button>
              <button type="button" className={cn(dna.ctaGhost, "min-h-12")} onClick={onCancel}>
                {dict.walkInCancel}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

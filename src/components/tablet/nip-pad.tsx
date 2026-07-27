"use client";

import { useEffect, useState, useTransition } from "react";
import type { DemoBrandKit } from "@/lib/demo/franchise-pitch";
import { submitPinPunchAction, type PinPunchIntent } from "@/lib/actions/punch-pin";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "ok"] as const;

export function NipPad({
  brand,
  demo = true,
  locationId,
  onDemoSubmit,
  flash,
  onFlashClear,
}: {
  brand: DemoBrandKit;
  demo?: boolean;
  locationId?: string;
  onDemoSubmit?: (pin: string) => void;
  flash?: string | null;
  onFlashClear?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [awaitingIntent, setAwaitingIntent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (flash) {
      setMessage(flash);
      setIsError(flash.toLowerCase().includes("invalide") || flash.toLowerCase().includes("erreur"));
      setAwaitingIntent(false);
      const t = setTimeout(() => {
        onFlashClear?.();
        setMessage(null);
        setPin("");
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [flash, onFlashClear]);

  function press(key: (typeof KEYS)[number]) {
    setMessage(null);
    if (key === "clear") {
      setPin("");
      setAwaitingIntent(false);
      return;
    }
    if (key === "ok") {
      if (pin.length !== 4) return;
      if (demo) {
        onDemoSubmit?.(pin);
        return;
      }
      setAwaitingIntent(true);
      return;
    }
    if (pin.length < 4) {
      setAwaitingIntent(false);
      setPin((p) => p + key);
    }
  }

  function submitIntent(intent: PinPunchIntent) {
    if (pin.length !== 4 || !locationId) {
      setMessage("Succursale introuvable");
      setIsError(true);
      return;
    }
    startTransition(async () => {
      const result = await submitPinPunchAction({ locationId, pin, intent });
      setAwaitingIntent(false);
      if (!result.ok) {
        setIsError(true);
        setMessage(result.message);
        setPin("");
        return;
      }
      setIsError(false);
      setMessage(result.message);
      setPin("");
    });
  }

  const clock = new Intl.DateTimeFormat("fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-stretch gap-6 py-2 sm:flex-row sm:items-center sm:gap-8">
      <div className="hidden flex-1 text-center sm:block">
        <p className="metric text-5xl font-semibold tracking-tight text-zinc-100">{clock}</p>
        <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
          Horodateur
        </p>
      </div>

      <div className="mx-auto w-full max-w-xs rounded-3xl border border-white/10 bg-zinc-900/90 p-8 shadow-lg backdrop-blur-2xl">
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
            Pointeuse {brand.name}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            {awaitingIntent
              ? "Choisis Entrée ou Sortie"
              : "Entre ton NIP à 4 chiffres"}
          </p>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-3 w-3 rounded-full border-2 transition",
                pin.length > i
                  ? "border-transparent bg-zinc-100"
                  : "border-zinc-600 bg-transparent",
              )}
            />
          ))}
        </div>

        {message && (
          <p
            className={cn(
              "mt-4 text-center text-sm font-semibold",
              isError ? "text-red-400" : "text-emerald-400",
            )}
          >
            {message}
          </p>
        )}

        {awaitingIntent ? (
          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitIntent("IN")}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-2 py-5 text-sm font-bold uppercase tracking-wide text-emerald-300 transition active:scale-95 disabled:opacity-60"
            >
              IN
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => submitIntent("OUT")}
              className="rounded-2xl border border-red-500/30 bg-red-500/15 px-2 py-5 text-sm font-bold uppercase tracking-wide text-red-300 transition active:scale-95 disabled:opacity-60"
            >
              OUT
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setAwaitingIntent(false);
                setPin("");
              }}
              className="col-span-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-3 text-xs font-semibold text-zinc-400 transition active:scale-95"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="mt-6 grid w-full grid-cols-3 place-items-center gap-3">
            {KEYS.map((key) => {
              const label = key === "clear" ? "⌫" : key === "ok" ? "OK" : key;
              const isClear = key === "clear";
              const isOk = key === "ok";
              return (
                <button
                  key={key}
                  type="button"
                  disabled={isPending}
                  onClick={() => press(key)}
                  className={cn(
                    "flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold transition active:scale-95 disabled:opacity-60",
                    isClear && "bg-red-500 text-sm font-bold text-white",
                    isOk && "bg-zinc-100 text-sm font-bold text-zinc-900",
                    !isClear &&
                      !isOk &&
                      "bg-white/10 text-zinc-50 hover:bg-white/15",
                  )}
                >
                  <span className={cn(!isClear && !isOk && "metric")}>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

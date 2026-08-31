"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Search, X } from "lucide-react";
import { walkInAtDoorAction } from "@/lib/actions/door";
import { dna } from "@/lib/design/dna";
import { parseTicketCode } from "@/lib/payments/interac-status";
import type { AccueilClassCard, AccueilRosterRow } from "@/lib/data/accueil-roster";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

type WalkInMode = "cash" | "interac" | null;

export function DoorSearchBar({
  value,
  onChange,
  dict,
  onScan,
  scanning,
}: {
  value: string;
  onChange: (next: string) => void;
  dict: Dictionary["accueil"];
  onScan: () => void;
  scanning: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <label className="sr-only" htmlFor="door-search">
        {dict.searchPlaceholder}
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <input
            id="door-search"
            ref={inputRef}
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={dict.searchPlaceholder}
            className={cn(dna.field, "min-h-12 pl-10 text-base")}
          />
        </div>
        <button
          type="button"
          data-interactive
          onClick={onScan}
          className={cn(dna.ctaGhost, "min-h-12 shrink-0 px-3")}
          aria-pressed={scanning}
          aria-label={scanning ? dict.scanStop : dict.scanQr}
        >
          {scanning ? <X className="h-4 w-4" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">{scanning ? dict.scanStop : dict.scanQr}</span>
        </button>
      </div>
      <p className="text-xs text-foreground-muted">{dict.searchHint}</p>
    </div>
  );
}

export function DoorCamera({
  active,
  onCode,
  unsupportedLabel,
}: {
  active: boolean;
  onCode: (value: string) => void;
  unsupportedLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (!active) return;
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setUnsupported(true);
      return;
    }

    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const detector = new Detector({ formats: ["qr_code"] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!videoRef.current || cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            if (raw && (parseTicketCode(raw) || raw.length >= 4)) {
              onCodeRef.current(raw);
              return;
            }
          } catch {
            /* keep scanning */
          }
          raf = window.requestAnimationFrame(() => {
            void tick();
          });
        };
        void tick();
      } catch {
        setUnsupported(true);
      }
    }

    void start();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  if (!active) return null;
  if (unsupported) {
    return <p className="text-sm text-foreground-muted">{unsupportedLabel}</p>;
  }

  return (
    <video
      ref={videoRef}
      className="aspect-video w-full rounded-2xl bg-black object-cover"
      muted
      playsInline
      autoPlay
    />
  );
}

export function WalkInBar({
  selected,
  lang,
  dict,
  onDone,
}: {
  selected: AccueilClassCard;
  lang: string;
  dict: Dictionary["accueil"];
  onDone: (enrollmentId: string) => void;
}) {
  const [mode, setMode] = useState<WalkInMode>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"LEAD" | "FOLLOW" | "SOLO">(
    selected.isSocial ? "SOLO" : "LEAD",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode) nameRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    setRole(selected.isSocial ? "SOLO" : "LEAD");
  }, [selected.sessionId, selected.isSocial]);

  async function submit() {
    if (!mode || !name.trim()) return;
    setBusy(true);
    setError(null);
    const result = await walkInAtDoorAction({
      sessionId: selected.sessionId,
      fullName: name.trim(),
      email: email.trim(),
      danceRole: role,
      payment: mode,
      lang,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "parity_imbalance"
          ? dict.walkInParity
          : result.error === "parity_role_full"
            ? dict.walkInFull
            : dict.walkInError,
      );
      return;
    }
    if (!result.enrollmentId) {
      setError(dict.walkInError);
      return;
    }
    setMode(null);
    setName("");
    setEmail("");
    onDone(result.enrollmentId);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-muted/40 p-3 sm:p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {dict.walkInTitle}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          data-interactive
          className={cn(dna.cta, "min-h-12 flex-1 text-sm")}
          onClick={() => setMode("cash")}
        >
          {dict.walkInCash}
        </button>
        <button
          type="button"
          data-interactive
          className={cn(dna.ctaGhost, "min-h-12 flex-1 text-sm")}
          onClick={() => setMode("interac")}
        >
          {dict.walkInInterac}
        </button>
      </div>
      {mode && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="sr-only" htmlFor="walk-in-name">
            {dict.walkInName}
          </label>
          <input
            id="walk-in-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={dict.walkInName}
            className={cn(dna.field, "min-h-12")}
            required
          />
          <label className="sr-only" htmlFor="walk-in-email">
            {dict.walkInEmail}
          </label>
          <input
            id="walk-in-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={dict.walkInEmail}
            className={cn(dna.field, "min-h-12")}
          />
          <div className="flex flex-wrap gap-1.5">
            {(["LEAD", "FOLLOW", "SOLO"] as const).map((r) => (
              <button
                key={r}
                type="button"
                data-interactive
                onClick={() => setRole(r)}
                className={cn(
                  "min-h-11 rounded-xl px-3 text-xs font-bold",
                  role === r ? "bg-accent text-accent-foreground" : "bg-surface text-foreground-muted",
                )}
              >
                {r === "LEAD" ? dict.leads : r === "FOLLOW" ? dict.follows : dict.solo}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className={cn(dna.cta, "min-h-12")}
            >
              {dict.walkInSubmit}
            </button>
            <button
              type="button"
              className={cn(dna.ctaGhost, "min-h-12")}
              onClick={() => {
                setMode(null);
                setError(null);
              }}
            >
              {dict.walkInCancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function collectDoorHits(
  classes: AccueilClassCard[],
  query: string,
  match: (row: AccueilRosterRow, q: string) => boolean,
): Array<{ sessionId: string; row: AccueilRosterRow }> {
  if (query.trim().length < 2) return [];
  const hits: Array<{ sessionId: string; row: AccueilRosterRow }> = [];
  for (const cls of classes) {
    for (const row of cls.roster) {
      if (match(row, query)) hits.push({ sessionId: cls.sessionId, row });
    }
  }
  return hits;
}

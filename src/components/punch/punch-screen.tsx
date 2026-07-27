"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock3, Coffee, MapPin, MapPinOff, Square } from "lucide-react";
import {
  clockInAction,
  clockOutAction,
  endBreakAction,
  startBreakAction,
} from "@/lib/actions/punch";
import type { PunchCoords } from "@/lib/punch/core";
import { haversineDistanceMeters } from "@/lib/geo";
import type { PunchStatus } from "@/lib/data/punch";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { formatTimeRange } from "@/lib/calendar/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BREAK_REMINDER_HOURS = 5;

type GeoState = "checking" | "verified" | "outside" | "unavailable" | "denied";

function resolveErrorMessage(dict: Dictionary, code: string) {
  const map: Record<string, string> = {
    unauthorized: dict.punch.errors.unauthorized,
    shift_not_found: dict.punch.errors.shiftNotFound,
    already_clocked_in: dict.punch.errors.alreadyClockedIn,
    already_clocked_out: dict.punch.errors.alreadyClockedOut,
    not_clocked_in: dict.punch.errors.notClockedIn,
    break_already_active: dict.punch.errors.breakAlreadyActive,
    no_active_break: dict.punch.errors.noActiveBreak,
    outside_geofence: dict.punch.errors.outsideGeofence,
    coords_required: dict.punch.errors.coordsRequired,
    invalid_shift_status: dict.punch.errors.invalidShiftStatus,
    training_incomplete: dict.punch.errors.trainingIncomplete,
    onboarding_incomplete: dict.punch.errors.onboardingIncomplete,
    punch_too_soon: dict.punch.errors.punchTooSoon,
    race_lost: dict.punch.errors.raceLost,
    database_error: dict.punch.errors.databaseError,
  };
  return map[code] ?? dict.punch.errors.databaseError;
}

function formatElapsed(sinceIso: string, now: Date) {
  const since = new Date(sinceIso);
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatClockTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function PunchScreen({
  lang,
  dict,
  initialStatus,
  trainingBlocked = false,
  onboardingBlocked = false,
}: {
  lang: Locale;
  dict: Dictionary;
  initialStatus: PunchStatus;
  trainingBlocked?: boolean;
  onboardingBlocked?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<PunchCoords | null>(null);
  const [geoError, setGeoError] = useState<"denied" | "unavailable" | null>(() =>
    typeof navigator === "undefined" || !navigator.geolocation ? "unavailable" : null,
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setGeoError("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, []);

  const distanceMeters = useMemo(() => {
    const location = status.location;
    if (!coords || !location || location.latitude == null || location.longitude == null) return null;
    return Math.round(haversineDistanceMeters(coords.lat, coords.lng, location.latitude, location.longitude));
  }, [coords, status.location]);

  const geoState: GeoState = useMemo(() => {
    if (geoError) return geoError;
    if (!coords) return "checking";
    const location = status.location;
    if (!location || location.latitude == null || location.longitude == null) return "unavailable";
    return distanceMeters != null && distanceMeters <= location.geofenceRadiusMeters ? "verified" : "outside";
  }, [geoError, coords, status.location, distanceMeters]);

  const workedHours = useMemo(() => {
    if (!status.actualStartsAt) return 0;
    const end = status.actualEndsAt ? new Date(status.actualEndsAt) : now;
    return (end.getTime() - new Date(status.actualStartsAt).getTime()) / (1000 * 60 * 60);
  }, [status.actualStartsAt, status.actualEndsAt, now]);

  const showBreakReminder =
    status.state === "clocked_in" && !status.breakStartedAt && workedHours >= BREAK_REMINDER_HOURS;

  function runAction(
    action: () => Promise<{ ok: boolean; error?: string; distanceMeters?: number }>,
    applyOptimisticUpdate: (prev: PunchStatus, nowIso: string) => PunchStatus,
    options?: { refreshAfter?: boolean },
  ) {
    setError(null);
    const nowIso = new Date().toISOString();
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(
          result.error === "outside_geofence" && result.distanceMeters
            ? `${resolveErrorMessage(dict, result.error)} (${result.distanceMeters}m)`
            : resolveErrorMessage(dict, result.error ?? "database_error"),
        );
        return;
      }
      // Optimistic local transition — the server action already revalidates the page,
      // but flipping state immediately keeps the big button feeling instant.
      setStatus((prev) => applyOptimisticUpdate(prev, nowIso));
      if (options?.refreshAfter) router.refresh();
    });
  }

  const geofenceConfigured =
    status.location?.latitude != null &&
    status.location?.longitude != null &&
    (status.location.geofenceRadiusMeters ?? 0) > 0;
  const geoBlocksClockIn =
    geofenceConfigured && (geoState === "denied" || geoState === "outside" || geoState === "checking");
  const punchBlocked = trainingBlocked || onboardingBlocked || geoBlocksClockIn;

  if (!status.shift) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
          <Clock3 className="h-7 w-7 text-foreground-muted" aria-hidden />
        </div>
        <p className="text-base font-medium">{dict.punch.noShift}</p>
        <p className="max-w-xs text-sm text-foreground-muted">{dict.punch.noShiftHint}</p>
      </div>
    );
  }

  const shift = status.shift;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-6">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">{dict.punch.title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{dict.punch.subtitle}</p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {dict.punch.plannedShift}
        </p>
        <p className="mt-1 text-sm font-medium">
          {formatTimeRange(new Date(shift.startsAt), new Date(shift.endsAt), lang)} ·{" "}
          {shift.stationNameFr}
        </p>
      </section>

      <GeoBadge dict={dict} geoState={geoState} distanceMeters={distanceMeters} />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {showBreakReminder && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <span className="flex items-center gap-2">
            <Coffee className="h-4 w-4 shrink-0" aria-hidden />
            {dict.cnesst.breakReminder}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() =>
              runAction(
                () => startBreakAction(shift.id),
                (prev, nowIso) => ({ ...prev, state: "on_break", breakStartedAt: nowIso, breakEndedAt: null }),
              )
            }
          >
            {dict.punch.breakReminderCta}
          </Button>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <StatusRing status={status.state} dict={dict} />

        <div className="text-center">
          <p className="text-4xl font-semibold tabular-nums tracking-tight">
            {status.state === "clocked_in" && status.actualStartsAt && formatElapsed(status.actualStartsAt, now)}
            {status.state === "on_break" && status.breakStartedAt && formatElapsed(status.breakStartedAt, now)}
            {status.state === "not_started" && "00:00:00"}
            {status.state === "clocked_out" && formatElapsed(status.actualStartsAt ?? now.toISOString(), new Date(status.actualEndsAt ?? now))}
          </p>
          <p className="mt-1 text-sm text-foreground-muted">
            {status.state === "clocked_in" &&
              status.actualStartsAt &&
              `${dict.punch.activeSince} ${formatClockTime(status.actualStartsAt, lang)}`}
            {status.state === "on_break" &&
              status.breakStartedAt &&
              `${dict.punch.onBreakSince} ${formatClockTime(status.breakStartedAt, lang)}`}
          </p>
        </div>

        <PrimaryAction
          dict={dict}
          status={status}
          isPending={isPending}
          trainingBlocked={punchBlocked}
          onClockIn={() =>
            runAction(
              () => clockInAction(shift.id, coords ?? undefined),
              (prev, nowIso) => ({ ...prev, state: "clocked_in", actualStartsAt: nowIso }),
            )
          }
          onClockOut={() =>
            runAction(
              () => clockOutAction(shift.id),
              (prev, nowIso) => ({ ...prev, state: "clocked_out", actualEndsAt: nowIso }),
              { refreshAfter: true },
            )
          }
          onEndBreak={() =>
            runAction(
              () => endBreakAction(shift.id),
              (prev, nowIso) => ({ ...prev, state: "clocked_in", breakEndedAt: nowIso }),
            )
          }
        />

        {status.state === "clocked_in" && !status.breakStartedAt && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() =>
              runAction(
                () => startBreakAction(shift.id),
                (prev, nowIso) => ({ ...prev, state: "on_break", breakStartedAt: nowIso, breakEndedAt: null }),
              )
            }
          >
            <Coffee className="h-4 w-4" aria-hidden />
            {dict.punch.startBreak}
          </Button>
        )}
      </div>

      {status.state === "clocked_out" && <ShiftSummary dict={dict} status={status} />}
    </div>
  );
}

function StatusRing({ status, dict }: { status: PunchStatus["state"]; dict: Dictionary }) {
  const config: Record<PunchStatus["state"], { ring: string; icon: typeof Clock3; label: string }> = {
    no_shift: { ring: "bg-surface-muted text-foreground-muted", icon: Clock3, label: "" },
    not_started: { ring: "bg-surface-muted text-foreground-muted", icon: Clock3, label: dict.punch.statusNotStarted },
    clocked_in: { ring: "bg-success/10 text-success", icon: Clock3, label: dict.punch.statusClockedIn },
    on_break: { ring: "bg-warning/10 text-warning", icon: Coffee, label: dict.punch.statusOnBreak },
    clocked_out: { ring: "bg-accent/10 text-accent", icon: Check, label: dict.punch.statusClockedOut },
  };
  const { ring, icon: Icon, label } = config[status];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("flex h-20 w-20 items-center justify-center rounded-full", ring)}>
        <Icon className="h-8 w-8" aria-hidden />
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

function PrimaryAction({
  dict,
  status,
  isPending,
  trainingBlocked,
  onClockIn,
  onClockOut,
  onEndBreak,
}: {
  dict: Dictionary;
  status: PunchStatus;
  isPending: boolean;
  trainingBlocked?: boolean;
  onClockIn: () => void;
  onClockOut: () => void;
  onEndBreak: () => void;
}) {
  if (status.state === "clocked_out") {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Check className="h-12 w-12" aria-hidden />
      </div>
    );
  }

  if (status.state === "on_break") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={onEndBreak}
        className="flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-warning text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
      >
        <Coffee className="h-9 w-9" aria-hidden />
        <span className="text-sm font-semibold">{isPending ? dict.punch.endingBreak : dict.punch.endBreak}</span>
      </button>
    );
  }

  if (status.state === "clocked_in") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={onClockOut}
        className="flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-danger text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
      >
        <Square className="h-9 w-9" aria-hidden fill="currentColor" />
        <span className="text-sm font-semibold">{isPending ? dict.punch.clockingOut : dict.punch.clockOut}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending || trainingBlocked}
      onClick={onClockIn}
      className="flex h-40 w-40 flex-col items-center justify-center gap-1 rounded-full bg-success text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
    >
      <Clock3 className="h-9 w-9" aria-hidden />
      <span className="text-sm font-semibold">{isPending ? dict.punch.clockingIn : dict.punch.clockIn}</span>
    </button>
  );
}

function GeoBadge({
  dict,
  geoState,
  distanceMeters,
}: {
  dict: Dictionary;
  geoState: GeoState;
  distanceMeters: number | null;
}) {
  const config: Record<GeoState, { icon: typeof MapPin; text: string; tone: string }> = {
    checking: { icon: MapPin, text: dict.punch.locationChecking, tone: "text-foreground-muted" },
    verified: { icon: MapPin, text: dict.punch.locationVerified, tone: "text-success" },
    outside: { icon: MapPinOff, text: dict.punch.locationOutside, tone: "text-warning" },
    unavailable: { icon: MapPinOff, text: dict.punch.locationUnavailable, tone: "text-foreground-muted" },
    denied: { icon: MapPinOff, text: dict.punch.locationDenied, tone: "text-foreground-muted" },
  };
  const { icon: Icon, text, tone } = config[geoState];

  return (
    <div className={cn("flex items-center justify-center gap-1.5 text-xs", tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {text}
      {geoState === "outside" && distanceMeters != null ? ` (${distanceMeters}m)` : ""}
    </div>
  );
}

function ShiftSummary({ dict, status }: { dict: Dictionary; status: PunchStatus }) {
  if (!status.shift || !status.actualStartsAt || !status.actualEndsAt) return null;

  const plannedHours =
    (new Date(status.shift.endsAt).getTime() - new Date(status.shift.startsAt).getTime()) / (1000 * 60 * 60);
  const actualHours =
    (new Date(status.actualEndsAt).getTime() - new Date(status.actualStartsAt).getTime()) / (1000 * 60 * 60);
  const variance = Math.round((plannedHours - actualHours) * 100) / 100;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm font-semibold">{dict.punch.workedSummary}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-foreground-muted">{dict.punch.plannedLabel}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{plannedHours.toFixed(2)}h</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">{dict.punch.actualLabel}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{actualHours.toFixed(2)}h</dd>
        </div>
        <div>
          <dt className="text-xs text-foreground-muted">{dict.punch.varianceLabel}</dt>
          <dd
            className={cn(
              "mt-0.5 text-lg font-semibold tabular-nums",
              variance > 0 ? "text-success" : variance < 0 ? "text-danger" : "",
            )}
          >
            {variance > 0 ? "+" : ""}
            {variance}h
          </dd>
        </div>
      </dl>
      {status.breakTakenMinutes != null && (
        <p className="mt-3 text-center text-xs text-foreground-muted">
          {dict.punch.breakTakenLabel}: {status.breakTakenMinutes} min
        </p>
      )}
    </section>
  );
}

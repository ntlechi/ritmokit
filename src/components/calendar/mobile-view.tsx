"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { differenceInMinutes, format, isToday, isTomorrow } from "date-fns";
import { enUS, es, fr } from "date-fns/locale";
import { AlertTriangle, ArrowLeftRight, Check, Clock3, Coffee, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmShiftAction, requestSwapAction } from "@/lib/actions/shifts";
import { formatTimeRange, shiftDurationHours } from "@/lib/calendar/format";
import { statusTone } from "@/lib/calendar/style";
import type { ShiftWithEmployee } from "@/lib/data/shifts";
import {
  stationDotStyle,
  stationGlowStyle,
  stationHeroTintStyle,
  stationLabel,
  stationRailStyle,
} from "@/lib/stations/display";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const dateFnsLocales = { fr, en: enUS, es } as const;

/** Pastille de statut — remplace les badges lourds par un point + libellé fin. */
const statusDot: Record<ReturnType<typeof toneOf>, string> = {
  neutral: "bg-zinc-400",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function toneOf(status: ShiftWithEmployee["status"]) {
  return statusTone[status];
}

function formatHours(hours: number, locale: Locale) {
  const rounded = Math.round(hours * 10) / 10;
  return rounded.toLocaleString(locale === "fr" ? "fr-CA" : locale);
}

function dayHeading(date: Date, locale: Locale, dict: Dictionary) {
  if (isToday(date)) return dict.calendar.today;
  if (isTomorrow(date)) return dict.calendar.tomorrow;
  return format(date, "EEEE d MMMM", { locale: dateFnsLocales[locale] });
}

/**
 * Compte à rebours vivant — calculé après montage uniquement pour rester
 * hydration-safe, rafraîchi chaque minute.
 */
function useCountdown(target: Date, end: Date, dict: Dictionary) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    function compute() {
      const now = new Date();
      if (now >= target && now < end) {
        setLabel(dict.calendar.inProgress);
        return;
      }
      if (now >= end) {
        setLabel(null);
        return;
      }
      const minutes = differenceInMinutes(target, now);
      const distance =
        minutes < 60
          ? `${minutes} min`
          : minutes < 60 * 24
            ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
            : null;
      setLabel(distance ? dict.calendar.startsIn.replace("{distance}", distance) : null);
    }
    compute();
    const timer = setInterval(compute, 60_000);
    return () => clearInterval(timer);
  }, [target, end, dict.calendar.inProgress, dict.calendar.startsIn]);

  return label;
}

function AlertLine({ icon: Icon, children }: { icon: typeof AlertTriangle; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-warning">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function ShiftActions({
  shift,
  dict,
  isPending,
  onConfirm,
  onSwap,
  size = "sm",
}: {
  shift: ShiftWithEmployee;
  dict: Dictionary;
  isPending: boolean;
  onConfirm: (id: string) => void;
  onSwap: (id: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex gap-2">
      <Button
        variant="primary"
        size={size}
        className="flex-1"
        disabled={isPending}
        onClick={() => onConfirm(shift.id)}
      >
        <Check className="mr-1.5 h-4 w-4" aria-hidden />
        {dict.actions.confirm}
      </Button>
      <Button
        variant="secondary"
        size={size}
        className="flex-1"
        disabled={isPending}
        onClick={() => onSwap(shift.id)}
      >
        <ArrowLeftRight className="mr-1.5 h-4 w-4" aria-hidden />
        {dict.actions.requestSwap}
      </Button>
    </div>
  );
}

/** Carte héros — le prochain quart, l'information n°1 de la journée. */
function NextShiftHero({
  shift,
  locale,
  dict,
  isPending,
  onConfirm,
  onSwap,
}: {
  shift: ShiftWithEmployee;
  locale: Locale;
  dict: Dictionary;
  isPending: boolean;
  onConfirm: (id: string) => void;
  onSwap: (id: string) => void;
}) {
  const countdown = useCountdown(shift.startsAt, shift.endsAt, dict);
  const resolvedPeriod = shift.period ?? "DAY";
  const PeriodIcon = resolvedPeriod === "NIGHT" ? Moon : Sun;
  const stationStyle = stationDotStyle(shift.station.colorHex);
  const durationH = shiftDurationHours(shift.startsAt, shift.endsAt);
  const actionable = shift.status === "PUBLISHED" || shift.status === "PENDING_CONFIRMATION";
  const hasAlert = shift.overtimeFlag || shift.restViolationFlag;

  return (
    <section
      className="shimmer-overlay animate-fade-up relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-900/60"
      style={stationGlowStyle(shift.station.colorHex)}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={stationRailStyle(shift.station.colorHex)}
        aria-hidden
      />
      <div
        className="border-b border-zinc-200/60 p-5 dark:border-white/5"
        style={stationHeroTintStyle(shift.station.colorHex)}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
            {dict.calendar.nextShift}
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
            <span className={cn("h-1.5 w-1.5 rounded-full", statusDot[toneOf(shift.status)])} aria-hidden />
            {dict.shiftStatus[shift.status]}
          </span>
        </div>

        <p className="mt-3 text-sm font-medium capitalize text-foreground">
          {dayHeading(shift.startsAt, locale, dict)}
        </p>
        <p className="mt-1 font-mono text-[2rem] font-semibold leading-none tracking-tight tabular-nums">
          {formatTimeRange(shift.startsAt, shift.endsAt, locale)}
        </p>

        {countdown && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {countdown}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-current/15"
              style={stationStyle}
              aria-hidden
            />
            {stationLabel(shift.station, locale)}
          </span>
          <span className="inline-flex items-center gap-1">
            <PeriodIcon className="h-3.5 w-3.5" aria-hidden />
            {dict.shiftPeriod[resolvedPeriod]}
          </span>
          <span className="font-mono tabular-nums">
            {formatHours(durationH, locale)} {dict.calendar.hoursUnit}
          </span>
          {shift.breakMinutes > 0 && (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <Coffee className="h-3.5 w-3.5" aria-hidden />
              {dict.calendar.breakShort.replace("{min}", String(shift.breakMinutes))}
            </span>
          )}
        </div>
      </div>

      {(hasAlert || shift.lateArrivalFlag || actionable) && (
        <div className="space-y-3 p-4">
          {hasAlert && (
            <AlertLine icon={AlertTriangle}>
              {shift.overtimeFlag ? dict.cnesst.overtimeWarning : dict.cnesst.restViolation}
            </AlertLine>
          )}
          {shift.lateArrivalFlag && (
            <AlertLine icon={Clock3}>
              {dict.agents.lateArrivalBadge}
              {shift.lateArrivalMinutes ? ` — ${shift.lateArrivalMinutes} min` : ""}
            </AlertLine>
          )}
          {actionable && (
            <ShiftActions
              shift={shift}
              dict={dict}
              isPending={isPending}
              onConfirm={onConfirm}
              onSwap={onSwap}
              size="md"
            />
          )}
        </div>
      )}
    </section>
  );
}

/** Rangée compacte — colonne horaire mono à gauche, scannable en un regard. */
function ShiftRow({
  shift,
  locale,
  dict,
  isPending,
  onConfirm,
  onSwap,
}: {
  shift: ShiftWithEmployee;
  locale: Locale;
  dict: Dictionary;
  isPending: boolean;
  onConfirm: (id: string) => void;
  onSwap: (id: string) => void;
}) {
  const resolvedPeriod = shift.period ?? "DAY";
  const PeriodIcon = resolvedPeriod === "NIGHT" ? Moon : Sun;
  const stationStyle = stationDotStyle(shift.station.colorHex);
  const actionable = shift.status === "PUBLISHED" || shift.status === "PENDING_CONFIRMATION";
  const hasAlert = shift.overtimeFlag || shift.restViolationFlag;
  const opts = { locale: dateFnsLocales[locale] };

  return (
    <li className="card-lift relative overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-900/60">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={stationRailStyle(shift.station.colorHex)}
        aria-hidden
      />
      <div className="flex items-stretch gap-3 p-3.5">
        <div className="flex w-14 shrink-0 flex-col justify-center border-r border-zinc-200/60 pr-3 font-mono tabular-nums dark:border-white/5">
          <span className="text-sm font-semibold leading-tight">{format(shift.startsAt, "HH:mm", opts)}</span>
          <span className="text-xs leading-tight text-foreground-muted">{format(shift.endsAt, "HH:mm", opts)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
              <span className="h-2 w-2 rounded-full" style={stationStyle} aria-hidden />
              {stationLabel(shift.station, locale)}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-foreground-muted">
              <span className={cn("h-1.5 w-1.5 rounded-full", statusDot[toneOf(shift.status)])} aria-hidden />
              {dict.shiftStatus[shift.status]}
            </span>
          </div>

          <p className="mt-0.5 flex items-center gap-2 text-xs text-foreground-muted">
            <span className="inline-flex items-center gap-1">
              <PeriodIcon className="h-3 w-3" aria-hidden />
              {dict.shiftPeriod[resolvedPeriod]}
            </span>
            <span className="font-mono tabular-nums">
              {formatHours(shiftDurationHours(shift.startsAt, shift.endsAt), locale)} {dict.calendar.hoursUnit}
            </span>
          </p>

          {hasAlert && (
            <div className="mt-1.5">
              <AlertLine icon={AlertTriangle}>
                {shift.overtimeFlag ? dict.cnesst.overtimeWarning : dict.cnesst.restViolation}
              </AlertLine>
            </div>
          )}
        </div>
      </div>

      {actionable && (
        <div className="border-t border-zinc-200/60 px-3.5 py-2.5 dark:border-white/5">
          <ShiftActions shift={shift} dict={dict} isPending={isPending} onConfirm={onConfirm} onSwap={onSwap} />
        </div>
      )}
    </li>
  );
}

export function MobileView({
  shifts,
  locale,
  dict,
}: {
  shifts: ShiftWithEmployee[];
  locale: Locale;
  dict: Dictionary;
}) {
  const [localShifts, setLocalShifts] = useState(shifts);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm(shiftId: string) {
    const previousStatus = localShifts.find((s) => s.id === shiftId)?.status;
    setError(null);
    setLocalShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, status: "CONFIRMED" } : s)),
    );
    startTransition(async () => {
      const result = await confirmShiftAction(shiftId);
      if (!result.ok) {
        setError(result.error);
        setLocalShifts((prev) =>
          prev.map((s) => (s.id === shiftId && previousStatus ? { ...s, status: previousStatus } : s)),
        );
      }
    });
  }

  function requestSwap(shiftId: string) {
    const previousStatus = localShifts.find((s) => s.id === shiftId)?.status;
    setError(null);
    setLocalShifts((prev) =>
      prev.map((s) => (s.id === shiftId ? { ...s, status: "PENDING_CONFIRMATION" } : s)),
    );
    startTransition(async () => {
      const result = await requestSwapAction(shiftId, "Demande d'échange depuis l'application mobile");
      if (!result.ok) {
        setError(result.error);
        setLocalShifts((prev) =>
          prev.map((s) => (s.id === shiftId && previousStatus ? { ...s, status: previousStatus } : s)),
        );
      }
    });
  }

  const [nextShift, ...restShifts] = localShifts;

  const totalHours = useMemo(
    () => localShifts.reduce((sum, s) => sum + shiftDurationHours(s.startsAt, s.endsAt), 0),
    [localShifts],
  );

  const groupedRest = useMemo(() => {
    const groups: { key: string; date: Date; shifts: ShiftWithEmployee[] }[] = [];
    for (const shift of restShifts) {
      const key = format(shift.startsAt, "yyyy-MM-dd");
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.shifts.push(shift);
      else groups.push({ key, date: shift.startsAt, shifts: [shift] });
    }
    return groups;
  }, [restShifts]);

  if (localShifts.length === 0) {
    return (
      <p className="rounded-2xl border border-zinc-200/80 bg-zinc-50 px-4 py-8 text-center text-sm text-foreground-muted dark:border-white/10 dark:bg-white/5">
        {dict.calendar.noShifts}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-baseline justify-between px-1">
        <p className="font-mono text-sm font-medium tabular-nums">
          {formatHours(totalHours, locale)} {dict.calendar.hoursUnit}
          <span className="ml-1 font-sans text-xs font-normal text-foreground-muted">
            {dict.calendar.upcomingLabel}
          </span>
        </p>
        <p className="font-mono text-xs tabular-nums text-foreground-muted">
          {dict.calendar.shiftCount.replace("{count}", String(localShifts.length))}
        </p>
      </div>

      <NextShiftHero
        shift={nextShift}
        locale={locale}
        dict={dict}
        isPending={isPending}
        onConfirm={confirm}
        onSwap={requestSwap}
      />

      {groupedRest.map((group) => (
        <section key={group.key}>
          <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
            {dayHeading(group.date, locale, dict)}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.shifts.map((shift) => (
              <ShiftRow
                key={shift.id}
                shift={shift}
                locale={locale}
                dict={dict}
                isPending={isPending}
                onConfirm={confirm}
                onSwap={requestSwap}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

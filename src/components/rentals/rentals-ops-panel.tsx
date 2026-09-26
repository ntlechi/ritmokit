"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveRentalBookingAction,
  createStaffRentalBookingAction,
  markRentalPaidAction,
  rejectRentalBookingAction,
  saveRentalSettingsAction,
} from "@/lib/actions/rentals";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dna } from "@/lib/design/dna";
import { cn } from "@/lib/utils";

export type RentalBookingRow = {
  id: string;
  roomName: string | null;
  date: string;
  timeStart: string;
  timeEnd: string;
  type: string;
  status: string;
  paymentStatus: string;
  priceCents: number;
  currency: string;
  client: { name: string; email: string; phone: string | null; org: string | null };
  notes: string | null;
  expiresAt: string | null;
};

export type RentalsDashboard = {
  locationId: string;
  timezone: string;
  todayIso: string;
  settings: {
    openHour: number;
    closeHour: number;
    bufferMinutes: number;
    minLeadHours: number;
    b2bRequiresApproval: boolean;
    durationOptions: number[];
    moduleEnabled: boolean;
  };
  pending: RentalBookingRow[];
  upcoming: RentalBookingRow[];
  awaitingPayment: RentalBookingRow[];
  recentlyExpired: RentalBookingRow[];
  draftSeasons: Array<{
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    classCount: number;
  }>;
  rooms: Array<{
    id: string;
    name: string;
    rentable: boolean;
    hourlyRateCents: number | null;
  }>;
};

const DURATION_CHOICES = [60, 90, 120, 180, 240, 300, 360, 480];

type RentalsDict = Dictionary["rentals"];

function moneyFormatter(lang: Locale) {
  return (cents: number, currency: string) =>
    new Intl.NumberFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-CA" : "fr-CA", {
      style: "currency",
      currency,
    }).format(cents / 100);
}

function dateTimeFormatter(lang: Locale, timeZone: string) {
  const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-CA" : lang === "es" ? "es-CA" : "fr-CA", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (iso: string) => fmt.format(new Date(iso));
}

function minutesBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh! * 60 + em!) - (sh! * 60 + sm!);
}

function paymentTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (status === "paid") return "success";
  if (status === "waived_staff") return "neutral";
  if (status === "cancelled") return "danger";
  return "warning";
}

function PaymentBadge({ t, status }: { t: RentalsDict; status: string }) {
  const label = t.payment[status as keyof RentalsDict["payment"]] ?? status;
  return <Badge tone={paymentTone(status)}>{label}</Badge>;
}

export function RentalsOpsPanel({
  lang,
  dict,
  initial,
}: {
  lang: Locale;
  dict: Dictionary;
  initial: RentalsDashboard;
}) {
  const t = dict.rentals;
  const router = useRouter();
  const money = moneyFormatter(lang);
  const formatDateTime = dateTimeFormatter(lang, initial.timezone);
  const { pending, upcoming, awaitingPayment, recentlyExpired, draftSeasons, todayIso } = initial;

  const [settings, setSettings] = useState(initial.settings);
  const [rooms, setRooms] = useState(initial.rooms);
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial.rooms.map((r) => [r.id, r.hourlyRateCents ? String(r.hourlyRateCents / 100) : ""]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    kind: "client" as "client" | "staff",
    bookingType: "prive" as "prive" | "b2b",
    roomId: initial.rooms.find((r) => r.rentable)?.id ?? initial.rooms[0]?.id ?? "",
    date: todayIso,
    timeStart: "10:00",
    timeEnd: "11:00",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientOrg: "",
    paymentProvider: "interac" as "interac" | "cash" | "paypal",
    paidNow: false,
    price: "",
    notes: "",
  });

  const owedCents = awaitingPayment.reduce((sum, r) => sum + r.priceCents, 0);
  const pricedRentableRooms = rooms.filter((r) => r.rentable && (r.hourlyRateCents ?? 0) > 0);

  const autoPriceCents = useMemo(() => {
    const room = rooms.find((r) => r.id === form.roomId);
    const minutes = minutesBetween(form.timeStart, form.timeEnd);
    if (!room?.hourlyRateCents || !(minutes > 0)) return 0;
    return Math.round((room.hourlyRateCents * minutes) / 60);
  }, [rooms, form.roomId, form.timeStart, form.timeEnd]);

  function resolveError(code: string) {
    const map: Record<string, string> = {
      unauthorized: t.errors.unauthorized,
      database_error: t.errors.databaseError,
      slot_unavailable: t.errors.slotUnavailable,
      invalid_payload: t.errors.invalidPayload,
      not_pending: t.errors.notPending,
      invalid_time_range: t.errors.invalidTimeRange,
      date_in_past: t.errors.dateInPast,
      rate_required: t.errors.rateRequired,
      not_payable: t.errors.notPayable,
      already_cancelled: t.errors.alreadyCancelled,
      invalid_hours: t.errors.invalidHours,
      hold_expired: t.errors.holdExpired,
    };
    return map[code] ?? t.errors.databaseError;
  }

  function run(id: string | null, action: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) {
    setError(null);
    setNotice(null);
    setActiveId(id);
    startTransition(async () => {
      const result = await action();
      setActiveId(null);
      if (!result.ok) {
        setError(resolveError(result.error ?? "database_error"));
        return;
      }
      done?.();
      router.refresh();
    });
  }

  function handleCancelConfirm(id: string) {
    run(id, () => rejectRentalBookingAction(id, cancelReason.trim() || undefined), () => {
      setCancelTarget(null);
      setCancelReason("");
    });
  }

  function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (form.kind === "client" && !form.clientEmail.trim() && !form.clientPhone.trim()) {
      setError(t.errors.contactRequired);
      return;
    }
    const priceCents =
      form.kind === "client" && form.price.trim() !== ""
        ? Math.round(Number(form.price) * 100)
        : undefined;
    run(
      null,
      () =>
        createStaffRentalBookingAction({
          kind: form.kind,
          bookingType: form.bookingType,
          roomId: form.roomId,
          date: form.date,
          timeStart: form.timeStart,
          timeEnd: form.timeEnd,
          clientName: form.clientName,
          clientEmail: form.clientEmail.trim() || undefined,
          clientPhone: form.clientPhone.trim() || undefined,
          clientOrg: form.clientOrg.trim() || undefined,
          paymentProvider: form.paymentProvider,
          paidNow: form.paidNow,
          priceCents: Number.isFinite(priceCents) ? priceCents : undefined,
          notes: form.notes.trim() || undefined,
        }),
      () => {
        setNotice(t.booked);
        setForm((f) => ({
          ...f,
          clientName: "",
          clientEmail: "",
          clientPhone: "",
          clientOrg: "",
          price: "",
          paidNow: false,
          notes: "",
        }));
      },
    );
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const nextRooms = rooms.map((r) => ({
      ...r,
      hourlyRateCents: Math.round(Number(rates[r.id] || 0) * 100),
    }));
    run(
      null,
      () =>
        saveRentalSettingsAction({
          ...settings,
          rooms: nextRooms.map((r) => ({
            roomId: r.id,
            rentable: r.rentable,
            hourlyRateCents: r.hourlyRateCents,
          })),
        }),
      () => {
        setRooms(nextRooms);
        setNotice(t.saved);
      },
    );
  }

  function bookingActions(row: RentalBookingRow, { payable }: { payable: boolean }) {
    const busy = isPending && activeId === row.id;
    if (cancelTarget === row.id) {
      return (
        <div className="flex w-full flex-wrap items-center gap-2">
          <input
            className={cn(dna.field, "min-w-48 flex-1")}
            placeholder={t.cancelReason}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            autoFocus
          />
          <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => handleCancelConfirm(row.id)}>
            {t.confirmCancel}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setCancelTarget(null)}>
            {t.keepBooking}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {payable && (
          <>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => run(row.id, () => markRentalPaidAction(row.id, "interac"))}
            >
              {t.markPaidInterac}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => run(row.id, () => markRentalPaidAction(row.id, "cash"))}
            >
              {t.markPaidCash}
            </Button>
          </>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setCancelTarget(row.id);
            setCancelReason("");
          }}
        >
          {t.cancel}
        </Button>
      </div>
    );
  }

  function bookingSummary(row: RentalBookingRow) {
    return (
      <div className="min-w-0">
        <p className="font-medium">
          {row.roomName} · {row.date} · {row.timeStart}–{row.timeEnd}
        </p>
        <p className="text-foreground-muted">
          {row.client.name}
          {row.client.org ? ` · ${row.client.org}` : ""}
          {" · "}
          {t.types[row.type as keyof RentalsDict["types"]] ?? row.type}
        </p>
        {(row.client.phone || (row.client.email && row.client.email !== "staff@internal")) && (
          <p className="text-xs text-foreground-muted">
            {[row.client.phone, row.client.email !== "staff@internal" ? row.client.email : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={cn(dna.panel, "p-4")}>
          <p className="text-xs text-foreground-muted">{t.summaryUpcoming}</p>
          <p className="text-2xl font-bold tabular-nums">{upcoming.length}</p>
        </div>
        <div className={cn(dna.panel, "p-4")}>
          <p className="text-xs text-foreground-muted">{t.summaryOwed}</p>
          <p className={cn("text-2xl font-bold tabular-nums", owedCents > 0 && "text-warning")}>
            {money(owedCents, "CAD")}
          </p>
        </div>
        <div className={cn(dna.panel, "p-4")}>
          <p className="text-xs text-foreground-muted">{t.summaryRequests}</p>
          <p className={cn("text-2xl font-bold tabular-nums", pending.length > 0 && "text-warning")}>
            {pending.length}
          </p>
        </div>
        <div className={cn(dna.panel, "p-4")}>
          <Badge tone={settings.moduleEnabled && pricedRentableRooms.length > 0 ? "success" : "neutral"}>
            {settings.moduleEnabled ? t.websiteLive : t.websiteOff}
          </Badge>
          <p className="mt-2 text-xs text-foreground-muted">
            {pricedRentableRooms.length > 0
              ? pricedRentableRooms.map((r) => r.name).join(", ")
              : t.websiteNoRooms}
          </p>
        </div>
      </div>

      {draftSeasons.map((season) => (
        <div
          key={season.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <p className="min-w-0 flex-1">
            {t.draftSeasonWarning
              .replace("{name}", season.name)
              .replace("{from}", season.startsOn)
              .replace("{to}", season.endsOn)
              .replace("{n}", String(season.classCount))}
          </p>
          <Link href={`/${lang}/sessions`} className="font-medium text-warning underline-offset-2 hover:underline">
            {t.draftSeasonAction}
          </Link>
        </div>
      ))}

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-success/10 px-4 py-2 text-sm text-success">
          {notice}
        </p>
      )}

      {pending.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.b2bQueue}</h2>
            <p className="text-sm text-foreground-muted">{t.b2bQueueHint}</p>
          </div>
          {pending.map((row) => {
            const busy = isPending && activeId === row.id;
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-warning/30 bg-surface p-4 text-sm shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {bookingSummary(row)}
                  <div className="text-right">
                    <p className="font-semibold">{money(row.priceCents, row.currency)}</p>
                    <Badge tone="warning">{t.statusPending}</Badge>
                  </div>
                </div>
                {row.notes && <p className="mt-2 text-foreground-muted">{row.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => run(row.id, () => approveRentalBookingAction(row.id))}
                  >
                    {t.approve}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => run(row.id, () => rejectRentalBookingAction(row.id))}
                  >
                    {t.reject}
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.awaitingPayment}</h2>
          <p className="text-sm text-foreground-muted">{t.awaitingPaymentHint}</p>
        </div>
        {awaitingPayment.length === 0 ? (
          <p className={cn(dna.panel, "px-6 py-6 text-center text-sm text-foreground-muted")}>
            {t.emptyAwaitingPayment}
          </p>
        ) : (
          <ul className="space-y-2">
            {awaitingPayment.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface px-4 py-3 text-sm",
                  row.date < todayIso ? "border-danger/40" : "border-border",
                )}
              >
                {bookingSummary(row)}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold tabular-nums">{money(row.priceCents, row.currency)}</span>
                  <PaymentBadge t={t} status={row.paymentStatus} />
                  {row.expiresAt && (
                    <span className="text-xs text-foreground-muted">
                      {t.holdUntil.replace("{date}", formatDateTime(row.expiresAt))}
                    </span>
                  )}
                </div>
                {bookingActions(row, { payable: true })}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.upcoming}</h2>
          <p className="text-sm text-foreground-muted">{t.upcomingHint}</p>
        </div>
        {upcoming.length === 0 ? (
          <p className={cn(dna.panel, "px-6 py-6 text-center text-sm text-foreground-muted")}>
            {t.emptyUpcoming}
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                {bookingSummary(row)}
                <div className="flex flex-wrap items-center gap-3">
                  {row.priceCents > 0 && (
                    <span className="tabular-nums text-foreground-muted">
                      {money(row.priceCents, row.currency)}
                    </span>
                  )}
                  <PaymentBadge t={t} status={row.paymentStatus} />
                  {bookingActions(row, { payable: false })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recentlyExpired.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.recentlyExpired}</h2>
            <p className="text-sm text-foreground-muted">{t.recentlyExpiredHint}</p>
          </div>
          <ul className="space-y-2">
            {recentlyExpired.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm text-foreground-muted"
              >
                {bookingSummary(row)}
                <span className="tabular-nums line-through">{money(row.priceCents, row.currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.newBooking}</h2>
          <p className="text-sm text-foreground-muted">{t.newBookingHint}</p>
        </div>
        <form onSubmit={handleBook} className={cn(dna.panel, "grid gap-3 p-4 sm:grid-cols-2")}>
          <div className="flex flex-wrap gap-2 sm:col-span-2" role="radiogroup">
            {(["client", "staff"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                onClick={() => setForm((f) => ({ ...f, kind }))}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                  form.kind === kind
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-foreground-muted hover:text-foreground",
                )}
              >
                {kind === "client" ? t.kindClient : t.kindStaff}
              </button>
            ))}
          </div>

          <label className="grid gap-1 text-sm">
            <span>{t.room}</span>
            <select
              className={dna.field}
              value={form.roomId}
              onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
              required
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.hourlyRateCents ? ` · ${money(r.hourlyRateCents, "CAD")}/h` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{form.kind === "client" ? t.clientName : t.instructor}</span>
            <input
              className={dna.field}
              value={form.clientName}
              onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.date}</span>
            <input
              type="date"
              min={todayIso}
              className={dna.field}
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm">
              <span>{t.start}</span>
              <input
                type="time"
                step={900}
                className={dna.field}
                value={form.timeStart}
                onChange={(e) => setForm((f) => ({ ...f, timeStart: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.end}</span>
              <input
                type="time"
                step={900}
                className={dna.field}
                value={form.timeEnd}
                onChange={(e) => setForm((f) => ({ ...f, timeEnd: e.target.value }))}
                required
              />
            </label>
          </div>

          {form.kind === "client" && (
            <>
              <label className="grid gap-1 text-sm">
                <span>{t.clientEmail}</span>
                <input
                  type="email"
                  className={dna.field}
                  value={form.clientEmail}
                  onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.clientPhone}</span>
                <input
                  type="tel"
                  className={dna.field}
                  value={form.clientPhone}
                  onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.bookingType}</span>
                <select
                  className={dna.field}
                  value={form.bookingType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bookingType: e.target.value as "prive" | "b2b" }))
                  }
                >
                  <option value="prive">{t.types.prive}</option>
                  <option value="b2b">{t.types.b2b}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.clientOrg}</span>
                <input
                  className={dna.field}
                  value={form.clientOrg}
                  onChange={(e) => setForm((f) => ({ ...f, clientOrg: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.paymentMethod}</span>
                <select
                  className={dna.field}
                  value={form.paymentProvider}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paymentProvider: e.target.value as "interac" | "cash" | "paypal",
                    }))
                  }
                >
                  <option value="interac">{t.methodInterac}</option>
                  <option value="cash">{t.methodCash}</option>
                  <option value="paypal">{t.methodPaypal}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>{t.price}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  className={dna.field}
                  placeholder={t.priceAuto.replace("{amount}", money(autoPriceCents, "CAD"))}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.paidNow}
                  onChange={(e) => setForm((f) => ({ ...f, paidNow: e.target.checked }))}
                />
                {t.paidNow}
              </label>
            </>
          )}

          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>{t.notes}</span>
            <input
              className={dna.field}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" disabled={isPending || !form.roomId}>
              {t.book}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.ratesHours}</h2>
          <p className="text-sm text-foreground-muted">{t.ratesHoursHint}</p>
        </div>
        <form onSubmit={handleSaveSettings} className={cn(dna.panel, "space-y-4 p-4")}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.moduleEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, moduleEnabled: e.target.checked }))}
            />
            {t.moduleEnabled}
          </label>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span>{t.openHour}</span>
              <input
                type="number"
                min={0}
                max={23}
                className={dna.field}
                value={settings.openHour}
                onChange={(e) => setSettings((s) => ({ ...s, openHour: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.closeHour}</span>
              <input
                type="number"
                min={1}
                max={24}
                className={dna.field}
                value={settings.closeHour}
                onChange={(e) => setSettings((s) => ({ ...s, closeHour: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.bufferMinutes}</span>
              <input
                type="number"
                min={0}
                max={120}
                className={dna.field}
                value={settings.bufferMinutes}
                onChange={(e) => setSettings((s) => ({ ...s, bufferMinutes: Number(e.target.value) }))}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.minLeadHours}</span>
              <input
                type="number"
                min={0}
                max={168}
                className={dna.field}
                value={settings.minLeadHours}
                onChange={(e) => setSettings((s) => ({ ...s, minLeadHours: Number(e.target.value) }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.b2bRequiresApproval}
              onChange={(e) => setSettings((s) => ({ ...s, b2bRequiresApproval: e.target.checked }))}
            />
            {t.b2bRequiresApproval}
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t.durationOptions}</p>
            <div className="flex flex-wrap gap-2">
              {DURATION_CHOICES.map((minutes) => {
                const on = settings.durationOptions.includes(minutes);
                return (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSettings((s) => {
                        const next = on
                          ? s.durationOptions.filter((m) => m !== minutes)
                          : [...s.durationOptions, minutes].sort((a, b) => a - b);
                        return next.length ? { ...s, durationOptions: next } : s;
                      })
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                      on
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-foreground-muted hover:text-foreground",
                    )}
                  >
                    {minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60}`}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t.roomRates}</p>
            {rooms.map((room) => {
              const missingRate = room.rentable && !(Number(rates[room.id] || 0) > 0);
              return (
                <div
                  key={room.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2",
                    missingRate ? "border-danger/40" : "border-border",
                  )}
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={room.rentable}
                      onChange={(e) =>
                        setRooms((prev) =>
                          prev.map((r) => (r.id === room.id ? { ...r, rentable: e.target.checked } : r)),
                        )
                      }
                    />
                    {room.name}
                  </label>
                  {missingRate && <span className="text-xs text-danger">{t.rateRequired}</span>}
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <span>$/h</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={cn(dna.field, "w-24")}
                      value={rates[room.id] ?? ""}
                      onChange={(e) => setRates((prev) => ({ ...prev, [room.id]: e.target.value }))}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <Button type="submit" variant="primary" disabled={isPending}>
            {t.saveSettings}
          </Button>
        </form>
      </section>
    </div>
  );
}

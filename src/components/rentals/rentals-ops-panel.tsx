"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveRentalBookingAction,
  createStaffRentalBookingAction,
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
};

export type RentalsDashboard = {
  locationId: string;
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
  rooms: Array<{
    id: string;
    name: string;
    rentable: boolean;
    hourlyRateCents: number | null;
  }>;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency }).format(cents / 100);
}

export function RentalsOpsPanel({
  dict,
  initial,
}: {
  lang: Locale;
  dict: Dictionary;
  initial: RentalsDashboard;
}) {
  const t = dict.rentals;
  const [pending, setPending] = useState(initial.pending);
  const [upcoming, setUpcoming] = useState(initial.upcoming);
  const [settings, setSettings] = useState(initial.settings);
  const [rooms, setRooms] = useState(initial.rooms);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [staffForm, setStaffForm] = useState({
    roomId: initial.rooms[0]?.id ?? "",
    date: "",
    timeStart: "10:00",
    timeEnd: "11:00",
    clientName: "",
    notes: "",
  });

  const rateDraft = useMemo(
    () =>
      Object.fromEntries(
        rooms.map((r) => [r.id, r.hourlyRateCents != null ? String(r.hourlyRateCents / 100) : ""]),
      ),
    [rooms],
  );
  const [rates, setRates] = useState<Record<string, string>>(rateDraft);

  function resolveError(code: string) {
    const map: Record<string, string> = {
      unauthorized: t.errors.unauthorized,
      database_error: t.errors.databaseError,
      slot_unavailable: t.errors.slotUnavailable,
      invalid_payload: t.errors.invalidPayload,
      not_pending: t.errors.notPending,
    };
    return map[code] ?? t.errors.databaseError;
  }

  function handleApprove(id: string) {
    setError(null);
    setActiveId(id);
    startTransition(async () => {
      const result = await approveRentalBookingAction(id);
      setActiveId(null);
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      const row = pending.find((p) => p.id === id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      if (row) {
        setUpcoming((prev) =>
          [{ ...row, status: "confirmed", paymentStatus: "pending_interac" }, ...prev].slice(0, 15),
        );
      }
    });
  }

  function handleReject(id: string) {
    setError(null);
    setActiveId(id);
    startTransition(async () => {
      const result = await rejectRentalBookingAction(id);
      setActiveId(null);
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      setPending((prev) => prev.filter((p) => p.id !== id));
    });
  }

  function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createStaffRentalBookingAction(staffForm);
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      setStaffForm((f) => ({ ...f, clientName: "", notes: "" }));
      setUpcoming((prev) =>
        [
          {
            id: result.bookingId!,
            roomName: rooms.find((r) => r.id === staffForm.roomId)?.name ?? null,
            date: staffForm.date,
            timeStart: staffForm.timeStart,
            timeEnd: staffForm.timeEnd,
            type: "staff",
            status: "confirmed",
            paymentStatus: "waived_staff",
            priceCents: 0,
            currency: "CAD",
            client: { name: staffForm.clientName, email: "staff@internal", phone: null, org: null },
            notes: staffForm.notes || null,
          },
          ...prev,
        ].slice(0, 15),
      );
    });
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const roomPatches = rooms.map((r) => ({
        roomId: r.id,
        rentable: r.rentable,
        hourlyRateCents: Math.round(Number(rates[r.id] || 0) * 100),
      }));
      const result = await saveRentalSettingsAction({
        ...settings,
        rooms: roomPatches,
      });
      if (!result.ok) {
        setError(resolveError(result.error));
        return;
      }
      setRooms((prev) =>
        prev.map((r) => ({
          ...r,
          hourlyRateCents: Math.round(Number(rates[r.id] || 0) * 100),
        })),
      );
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.b2bQueue}</h2>
          <p className="text-sm text-foreground-muted">{t.b2bQueueHint}</p>
        </div>
        {pending.length === 0 ? (
          <p className={cn(dna.panel, "px-6 py-8 text-center text-sm text-foreground-muted")}>
            {t.emptyPending}
          </p>
        ) : (
          pending.map((row) => {
            const busy = isPending && activeId === row.id;
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-warning/30 bg-surface p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{row.client.name}</p>
                    {row.client.org && (
                      <p className="text-xs text-foreground-muted">{row.client.org}</p>
                    )}
                    <p className="mt-1 text-sm text-foreground-muted">
                      {row.roomName} · {row.date} · {row.timeStart}–{row.timeEnd}
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {money(row.priceCents, row.currency)}
                    </p>
                  </div>
                  <Badge tone="warning">{t.statusPending}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => handleApprove(row.id)}
                  >
                    {t.approve}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => handleReject(row.id)}
                  >
                    {t.reject}
                  </Button>
                </div>
              </article>
            );
          })
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {row.roomName} · {row.date} {row.timeStart}–{row.timeEnd}
                  </p>
                  <p className="text-foreground-muted">
                    {row.client.name}
                    {row.type === "staff" ? ` · ${t.typeStaff}` : ""}
                  </p>
                </div>
                <span className="text-foreground-muted">
                  {row.priceCents > 0 ? money(row.priceCents, row.currency) : t.waived}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t.staffBooking}</h2>
          <p className="text-sm text-foreground-muted">{t.staffBookingHint}</p>
        </div>
        <form
          onSubmit={handleStaffSubmit}
          className={cn(dna.panel, "grid gap-3 p-4 sm:grid-cols-2")}
        >
          <label className="grid gap-1 text-sm">
            <span>{t.room}</span>
            <select
              className={dna.field}
              value={staffForm.roomId}
              onChange={(e) => setStaffForm((f) => ({ ...f, roomId: e.target.value }))}
              required
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.instructor}</span>
            <input
              className={dna.field}
              value={staffForm.clientName}
              onChange={(e) => setStaffForm((f) => ({ ...f, clientName: e.target.value }))}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t.date}</span>
            <input
              type="date"
              className={dna.field}
              value={staffForm.date}
              onChange={(e) => setStaffForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-sm">
              <span>{t.start}</span>
              <input
                type="time"
                className={dna.field}
                value={staffForm.timeStart}
                onChange={(e) => setStaffForm((f) => ({ ...f, timeStart: e.target.value }))}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>{t.end}</span>
              <input
                type="time"
                className={dna.field}
                value={staffForm.timeEnd}
                onChange={(e) => setStaffForm((f) => ({ ...f, timeEnd: e.target.value }))}
                required
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>{t.notes}</span>
            <input
              className={dna.field}
              value={staffForm.notes}
              onChange={(e) => setStaffForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={isPending || !staffForm.roomId}>
              {t.bookStaff}
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
              onChange={(e) =>
                setSettings((s) => ({ ...s, moduleEnabled: e.target.checked }))
              }
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
                onChange={(e) =>
                  setSettings((s) => ({ ...s, openHour: Number(e.target.value) }))
                }
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
                onChange={(e) =>
                  setSettings((s) => ({ ...s, closeHour: Number(e.target.value) }))
                }
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
                onChange={(e) =>
                  setSettings((s) => ({ ...s, bufferMinutes: Number(e.target.value) }))
                }
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
                onChange={(e) =>
                  setSettings((s) => ({ ...s, minLeadHours: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.b2bRequiresApproval}
              onChange={(e) =>
                setSettings((s) => ({ ...s, b2bRequiresApproval: e.target.checked }))
              }
            />
            {t.b2bRequiresApproval}
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium">{t.roomRates}</p>
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2"
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={room.rentable}
                    onChange={(e) =>
                      setRooms((prev) =>
                        prev.map((r) =>
                          r.id === room.id ? { ...r, rentable: e.target.checked } : r,
                        ),
                      )
                    }
                  />
                  {room.name}
                </label>
                <label className="ml-auto flex items-center gap-2 text-sm">
                  <span>$/h</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={cn(dna.field, "w-24")}
                    value={rates[room.id] ?? ""}
                    onChange={(e) =>
                      setRates((prev) => ({ ...prev, [room.id]: e.target.value }))
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <Button type="submit" disabled={isPending}>
            {t.saveSettings}
          </Button>
        </form>
      </section>
    </div>
  );
}

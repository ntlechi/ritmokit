"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { doorCodeFromTicket } from "@/lib/dance/door-search";
import { dna } from "@/lib/design/dna";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { PublicScheduleClass } from "@/lib/public-api/schedule-types";
import { cn } from "@/lib/utils";

type PaymentMethod = "interac" | "stripe" | "paypal";

type InteracInstructions = {
  depositEmail: string | null;
  securityQuestion: string | null;
  passwordHint: string | null;
  amountCad: number;
  referenceHint: string;
};

type SuccessState = {
  ticketCode: string;
  waitlisted: boolean;
  paid: boolean;
  interac?: InteracInstructions | null;
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function money(amount: number, locale: string) {
  return new Intl.NumberFormat(locale === "en" ? "en-CA" : locale === "es" ? "es-CA" : "fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

function enrollErrorMessage(code: string, t: Dictionary["booking"]): string {
  if (code === "already_enrolled") return t.alreadyEnrolled;
  if (code === "parity_role_full") return t.roleFull;
  if (code === "parity_imbalance") return t.parityLocked;
  if (code === "parity_couple_full") return t.coupleFull;
  if (code === "booking_closed") return t.closed;
  return t.errorGeneric;
}

export function PublicBookingBoard({
  lang,
  studioName,
  seasonName,
  bookingOpen,
  classes,
  paymentMethods,
  returnUrl,
  cancelUrl,
  dict,
}: {
  lang: string;
  studioName: string;
  seasonName: string | null;
  bookingOpen: boolean;
  classes: PublicScheduleClass[];
  paymentMethods: PaymentMethod[];
  returnUrl: string;
  cancelUrl: string;
  dict: Dictionary;
}) {
  const t = dict.booking;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const selected = classes.find((cls) => cls.id === selectedId) ?? null;
  const byDay = useMemo(() => {
    const groups = new Map<number, PublicScheduleClass[]>();
    for (const cls of classes) {
      const day = cls.dayOfWeek ?? new Date(cls.startTime).getUTCDay();
      const list = groups.get(day) ?? [];
      list.push(cls);
      groups.set(day, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [classes]);

  if (!bookingOpen) {
    return <p className="text-sm text-foreground-muted">{t.closed}</p>;
  }

  if (success) {
    return (
      <section className={cn(dna.panelLg, "p-6")}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t.kicker}</p>
        <h2 className="mt-1 text-xl font-bold">{t.successTitle}</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          {success.waitlisted
            ? t.successWaitlist
            : success.paid
              ? t.successPaid
              : success.interac
                ? t.successInterac
                : t.successPaid}
        </p>
        <TicketCodes ticketCode={success.ticketCode} t={t} />
        {success.interac ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface-muted/50 p-4 text-sm">
            <p>{t.interacHint}</p>
            {success.interac.depositEmail ? (
              <p className="mt-2 font-medium">{success.interac.depositEmail}</p>
            ) : null}
            <p className="mt-1 tabular-nums">{money(success.interac.amountCad, lang)}</p>
            <p className="mt-1 text-foreground-muted">{success.interac.referenceHint}</p>
          </div>
        ) : null}
        <button
          type="button"
          className={cn(dna.ctaGhost, "mt-6 min-h-12")}
          onClick={() => {
            setSuccess(null);
            setSelectedId(null);
          }}
        >
          {t.back}
        </button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {seasonName ? (
        <p className="text-sm text-foreground-muted">
          {t.season}: <span className="font-medium text-foreground">{seasonName}</span>
        </p>
      ) : null}
      {classes.length === 0 ? (
        <p className="text-sm text-foreground-muted">{t.closed}</p>
      ) : (
        byDay.map(([day, rows]) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">
              {dict.dance.days[DAY_KEYS[day] ?? "mon"]}
            </h2>
            <ul className="flex flex-col gap-2">
              {rows.map((cls) => {
                const leadOpen = cls.capacity.canRegisterLead || cls.capacity.canWaitlistLead;
                const followOpen = cls.capacity.canRegisterFollow || cls.capacity.canWaitlistFollow;
                const closed = cls.capacity.full && !cls.capacity.waitlistActive;
                return (
                  <li key={cls.id}>
                    <article className={cn(dna.panel, "p-4")}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold">{cls.title}</p>
                          <p className="mt-0.5 text-sm text-foreground-muted">
                            {cls.startTimeLocal}–{cls.endTimeLocal} · {cls.room.name} ·{" "}
                            {cls.instructor.fullName}
                          </p>
                          <p className="mt-2 text-xs text-foreground-muted">
                            {t.leadsFree} {cls.capacity.leadsFree} · {t.followsFree}{" "}
                            {cls.capacity.followsFree} · {money(cls.pricing.regular, lang)}
                            {cls.pricing.couple != null
                              ? ` · ${t.couple} ${money(cls.pricing.couple, lang)}`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          data-interactive
                          disabled={closed}
                          className={cn(dna.cta, "min-h-11 shrink-0 text-sm")}
                          onClick={() => setSelectedId(cls.id)}
                        >
                          {closed ? t.full : cls.capacity.full ? t.waitlist : t.enroll}
                        </button>
                      </div>
                      {!leadOpen && !followOpen && !closed ? (
                        <p className="mt-2 text-xs text-foreground-muted">{t.waitlist}</p>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {selected ? (
        <BookingForm
          lang={lang}
          cls={selected}
          studioName={studioName}
          paymentMethods={paymentMethods}
          returnUrl={returnUrl}
          cancelUrl={cancelUrl}
          dict={dict}
          onCancel={() => setSelectedId(null)}
          onSuccess={setSuccess}
        />
      ) : null}
    </div>
  );
}

function BookingForm({
  lang,
  cls,
  studioName,
  paymentMethods,
  returnUrl,
  cancelUrl,
  dict,
  onCancel,
  onSuccess,
}: {
  lang: string;
  cls: PublicScheduleClass;
  studioName: string;
  paymentMethods: PaymentMethod[];
  returnUrl: string;
  cancelUrl: string;
  dict: Dictionary;
  onCancel: () => void;
  onSuccess: (state: SuccessState) => void;
}) {
  const t = dict.booking;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"LEAD" | "FOLLOW" | "SOLO">(
    cls.capacity.canRegisterLead ? "LEAD" : cls.capacity.canRegisterFollow ? "FOLLOW" : "LEAD",
  );
  const [withPartner, setWithPartner] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>(paymentMethods[0] ?? "interac");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = withPartner && cls.pricing.couple != null ? cls.pricing.couple : cls.pricing.regular;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await fetch("/api/public/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: cls.id,
          danceRole: withPartner && role === "SOLO" ? "LEAD" : role,
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          locale: lang,
          allowWaitlist: true,
          pricingTier: withPartner ? "COUPLE" : "REGULAR",
          paymentProvider: payment,
          returnUrl: `${origin}${returnUrl}`,
          cancelUrl: `${origin}${cancelUrl}`,
          ...(withPartner
            ? {
                partnerFullName: partnerName.trim(),
                partnerEmail: partnerEmail.trim(),
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        enrollmentId?: string;
        waitlisted?: boolean;
        paid?: boolean;
        ticketCode?: string;
        checkoutUrl?: string | null;
        payment?: { checkoutUrl?: string | null };
        interacInstructions?: InteracInstructions;
      };
      if (!res.ok || !data.ok) {
        setError(enrollErrorMessage(data.error ?? "error", t));
        return;
      }
      const checkout = data.checkoutUrl || data.payment?.checkoutUrl;
      if (checkout) {
        window.location.assign(checkout);
        return;
      }
      onSuccess({
        ticketCode: data.ticketCode ?? "",
        waitlisted: Boolean(data.waitlisted),
        paid: Boolean(data.paid),
        interac: data.interacInstructions ?? null,
      });
    } catch {
      setError(t.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={cn(dna.panelLg, "p-5")}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
        {studioName}
      </p>
      <h3 className="mt-1 text-lg font-bold">{cls.title}</h3>
      <p className="text-sm text-foreground-muted">
        {cls.startTimeLocal}–{cls.endTimeLocal} · {money(price, lang)}
      </p>

      <label className="mt-4 block text-xs font-semibold text-foreground-muted" htmlFor="book-name">
        {t.yourName}
      </label>
      <input
        id="book-name"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className={cn(dna.field, "mt-1 min-h-12")}
      />

      <label className="mt-3 block text-xs font-semibold text-foreground-muted" htmlFor="book-email">
        {t.email}
      </label>
      <input
        id="book-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={cn(dna.field, "mt-1 min-h-12")}
      />

      <label className="mt-3 block text-xs font-semibold text-foreground-muted" htmlFor="book-phone">
        {t.phone}
      </label>
      <input
        id="book-phone"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className={cn(dna.field, "mt-1 min-h-12")}
      />

      <p className="mt-4 text-xs font-semibold text-foreground-muted">{t.role}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {(
          [
            ["LEAD", cls.capacity.canRegisterLead || cls.capacity.canWaitlistLead],
            ["FOLLOW", cls.capacity.canRegisterFollow || cls.capacity.canWaitlistFollow],
            ["SOLO", cls.capacity.canRegisterSolo && !withPartner],
          ] as const
        ).map(([value, open]) => (
          <button
            key={value}
            type="button"
            disabled={!open}
            onClick={() => setRole(value)}
            className={cn(
              "min-h-11 rounded-xl px-3 text-xs font-bold",
              role === value ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground-muted",
              !open && "opacity-40",
            )}
          >
            {value === "LEAD" ? dict.dance.lead : value === "FOLLOW" ? dict.dance.follow : dict.dance.solo}
          </button>
        ))}
      </div>
      {!withPartner && cls.capacity.lockedRole === role ? (
        <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs font-medium text-warning">
          {t.parityLockedHint
            .replace("{role}", role === "LEAD" ? dict.dance.lead : dict.dance.follow)
            .replace("{other}", role === "LEAD" ? dict.dance.follow : dict.dance.lead)}
        </p>
      ) : null}

      {cls.capacity.canRegisterCouple ? (
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withPartner}
            onChange={(e) => {
              setWithPartner(e.target.checked);
              if (e.target.checked && role === "SOLO") setRole("LEAD");
            }}
          />
          {t.withPartner}
        </label>
      ) : null}

      {withPartner ? (
        <>
          <label className="mt-3 block text-xs font-semibold text-foreground-muted" htmlFor="book-partner">
            {t.partnerName}
          </label>
          <input
            id="book-partner"
            required
            value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)}
            className={cn(dna.field, "mt-1 min-h-12")}
          />
          <label
            className="mt-3 block text-xs font-semibold text-foreground-muted"
            htmlFor="book-partner-email"
          >
            {t.partnerEmail}
          </label>
          <input
            id="book-partner-email"
            type="email"
            required
            value={partnerEmail}
            onChange={(e) => setPartnerEmail(e.target.value)}
            className={cn(dna.field, "mt-1 min-h-12")}
          />
        </>
      ) : null}

      <p className="mt-4 text-xs font-semibold text-foreground-muted">{t.payHow}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {paymentMethods.map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => setPayment(method)}
            className={cn(
              "min-h-11 rounded-xl px-3 text-xs font-bold",
              payment === method ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground-muted",
            )}
          >
            {method === "interac" ? t.payInterac : method === "stripe" ? t.payStripe : t.payPaypal}
          </button>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={cn(dna.cta, "min-h-12")}>
          {busy
            ? t.submitting
            : !withPartner &&
                ((role === "LEAD" && !cls.capacity.canRegisterLead) ||
                  (role === "FOLLOW" && !cls.capacity.canRegisterFollow))
              ? t.submitWaitlist
              : t.submit}
        </button>
        <button type="button" className={cn(dna.ctaGhost, "min-h-12")} onClick={onCancel}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

export function BookingReturnTicket({
  ticketCode,
  paid,
  waitlisted,
  dict,
  backHref,
}: {
  ticketCode: string | null;
  paid: boolean;
  waitlisted: boolean;
  dict: Dictionary;
  backHref: string;
}) {
  const t = dict.booking;
  return (
    <section className={cn(dna.panelLg, "p-6")}>
      <h2 className="text-xl font-bold">{t.successTitle}</h2>
      <p className="mt-2 text-sm text-foreground-muted">
        {waitlisted ? t.successWaitlist : paid ? t.successPaid : t.successInterac}
      </p>
      {ticketCode ? <TicketCodes ticketCode={ticketCode} t={t} /> : null}
      <Link href={backHref} className={cn(dna.ctaGhost, "mt-6 inline-flex min-h-12")}>
        {t.back}
      </Link>
    </section>
  );
}

/**
 * Door code first (what the volunteer types at 18:58), full `RK|` ticket
 * second (what goes in the Interac message and what the QR encodes).
 */
function TicketCodes({ ticketCode, t }: { ticketCode: string; t: Dictionary["booking"] }) {
  const doorCode = doorCodeFromTicket(ticketCode);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
      {doorCode ? (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t.doorCode}</p>
          <p className="mt-0.5 font-mono text-4xl font-bold tracking-[0.2em] tabular-nums">{doorCode}</p>
          <p className="mt-1 text-xs text-foreground-muted">{t.doorCodeHint}</p>
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{t.ticket}</p>
        <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wide text-foreground-muted">
          {ticketCode}
        </p>
      </div>
    </div>
  );
}

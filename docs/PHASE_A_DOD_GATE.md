# Phase A Production DoD Gate

**Date:** 2026-07-29  
**Scope:** Code + config readiness for Steve / Salsa Attitude Vercel launch  
**Verdict:** **NOT GREEN** — DoD 2 & 4 are code-ready; DoD 1 & 3 need live env proof + small bugfixes before signature.

---

## Scoreboard

| # | Box | Status | One-line |
|---|-----|--------|----------|
| 1 | Public Pay | **YELLOW** | PayPal path exists; live env + webhook + BookingModal + capture edge bugs block green |
| 2 | Accueil Tablet | **GREEN** | FRONT_DESK can 1-tap check-in; Sessions admin blocked |
| 3 | Waitlist Promote | **YELLOW** | Promote + pay-link email coded; Resend + invoice_id retry + live UAT required |
| 4 | Yield Accuracy | **GREEN** | Cockpit revenue = Σ `amountCad` for paid seats (tier-aware) |

**Ship rule:** all four must be **GREEN on Vercel** with PayPal live. Until then, polish Accueil chrome is optional.

---

## DoD 1 — Public Pay

**Goal:** Public checkout → PayPal live → `paymentStatus=PAID` without studio DM.

### Code path (ready)

1. `POST /api/public/enrollments` → `createPublicEnrollment`
2. `createEnrollmentCheckout` → `createPayPalOrder`
3. `POST /api/webhooks/paypal` → capture → `markEnrollmentPaid`
4. Poll: `GET /api/public/enrollments/[id]/payment-status`

### Vercel / PayPal config (must verify in dashboard)

**Preferred:** Manager → Integrations (encrypted per-org PayPal). Platform only needs `RITMOKIT_FIELD_ENCRYPTION_KEY` + Resend. See `docs/INTEGRATION_HUB_SPEC.md`.

| Variable | Required |
|----------|----------|
| `RITMOKIT_FIELD_ENCRYPTION_KEY` | Yes (Integration Hub + HR encryption) |
| Hub PayPal CONNECTED/TESTING | Yes (Steve self-serve) **or** legacy env below |
| `RITMOKIT_PUBLIC_PAYMENT_PROVIDER=paypal` | Legacy default if hub empty |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Legacy fallback only |
| `PAYPAL_WEBHOOK_ID` | Legacy fallback only |
| `PAYPAL_MODE=live` | Legacy / hub mode field for Steve |
| `NEXT_PUBLIC_APP_URL` | Yes |
| `RITMOKIT_PUBLIC_ORIGINS` | Yes (Salsa Attitude / salsaquebec.com) |
| `PAYPAL_ALLOW_STUB` | **Unset** in production |

Webhook URL: `{NEXT_PUBLIC_APP_URL}/api/webhooks/paypal`  
Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`

### Gaps blocking GREEN

| Sev | Gap | Action |
|-----|-----|--------|
| P0 | Live PayPal + webhook not proven from repo | Sandbox UAT then live $ smoke |
| P0 | BookingModal redirect (A1c) is on **Salsa Attitude site**, not RitmoKit | Wire `returnUrl` / `cancelUrl` + redirect to `checkoutUrl` |
| P0 | ~~`capturePayPalOrder` treats broad `UNPROCESSABLE_ENTITY` as success~~ | **Fixed 2026-07-29** — only `ORDER_ALREADY_CAPTURED` + `isPayPalCaptureComplete` gate |
| P0 | ~~`markEnrollmentPaid` heal gap~~ | **Fixed 2026-07-29** — replay/`P2002` heals unpaid enrollment |
| P1 | Checkout regenerate can collide PayPal `invoice_id` | Unique invoice per attempt |
| P1 | Failed checkout still returns 201 with `checkoutUrl: null` | Surface error to BookingModal |

### Manual UAT (sandbox → live)

1. Set sandbox env + webhook; migrate DB.
2. `POST /enrollments` Lead REGULAR → `checkoutUrl` + `PENDING`.
3. Pay in PayPal sandbox → DB `PAID` + `payment_events` row.
4. Replay webhook → idempotent, still one PAID.
5. Waitlisted Follow → no checkout URL.
6. `provider=none` → unpaid hold.
7. Live: `PAYPAL_MODE=live`, one real low-amount class from public origin.

---

## DoD 2 — Accueil Tablet

**Goal:** Full evening check-in without Sessions admin.

### Status: GREEN (code)

| Check | Evidence |
|-------|----------|
| Tablet route | `/[lang]/accueil` |
| FRONT_DESK access | `canAccessAccueil` |
| Sessions blocked for FD | `canAccessManagerSettings` on `/sessions` |
| 1-tap attendance | `markAttendanceAction` + `check-in-row` |
| L/F meters | `role-meters.tsx` |
| Unpaid / waitlist badges | Accueil roster badges |

### Minor polish (not launch blockers)

- Unpaid copy is “En attente / Pending” vs spec “À encaisser”
- No dedicated kiosk full-bleed chrome (lg sidebar already hidden on tablet width)

### Manual UAT

1. Login as `FRONT_DESK` on iPad width.
2. `/fr/accueil` works; `/fr/sessions` redirects away.
3. Check in unpaid seat → present increments; unpaid badge remains.
4. Waitlisted row: no check-in control.
5. Refresh → attendance persists.

---

## DoD 3 — Waitlist Auto-Promote

**Goal:** New Lead (paid / seated capacity) unlocks oldest waitlisted Follow + pay-link email.

### Code path (ready)

- Triggered from `markEnrollmentPaid` → `tryPromoteWaitlist`
- Also after seated public enroll in `createPublicEnrollment`
- Lock: `FOR UPDATE SKIP LOCKED`, oldest `waitlisted_at`
- Email: `sendEnrollmentEmail(... waitlist_promoted_pay)` with PayPal checkout URL

### Gaps blocking GREEN

| Sev | Gap | Action |
|-----|-----|--------|
| P0 | `RESEND_API_KEY` + `EMAIL_FROM` unset → email **no-ops** (logs only) | Set on Vercel or DoD fails “email” clause |
| P1 | Promote return URLs hardcode `/fr/login?paid=1` | Prefer public BookingModal return URLs |
| P1 | Same `invoice_id` collision risk on promote checkout | Share fix with DoD 1 |
| P2 | Spec “Lead signup” — unpaid Lead hold may promote before PayPal completes (by design after seated create); confirm Steve accepts promote-on-seat vs promote-on-pay only | Product confirm |

### Manual UAT

1. Fill Follows; put Follow on waitlist.
2. Enroll + pay a Lead (sandbox).
3. Oldest waitlisted Follow: `waitlisted=false`, `promotedAt` set, `PENDING` checkout.
4. Confirm Resend delivery of pay link (not just `[email:stub]` logs).
5. Follow pays → `PAID`.

---

## DoD 4 — Yield Accuracy

**Goal:** Cockpit revenue / $/m² match Σ paid enrollment amounts (tier-aware).

### Status: GREEN (code)

- `enrollmentRevenueCad` in `src/lib/dance/pricing.ts` uses `amountCad` when present, else tier × session prices.
- `buildClassEconomicsRows` sums seat revenue for paid, non-waitlisted seats — **not** `paidCount * priceRegular`.
- Rooms overview `yieldPerSqm` uses that net margin path.

### Manual UAT (spot-check Steve trusts)

1. Create class with REGULAR / STUDENT / COUPLE prices.
2. Pay one of each tier via PayPal.
3. Cockpit week revenue = sum of three `amountCad` values (within rounding).
4. Compare PayPal capture total for those three vs cockpit.
5. Confirm couple/student ≠ three × regular.

---

## Recommended fix order before signature

1. **P0 payment harden** — capture COMPLETED check + heal unpaid on replay (`markEnrollmentPaid` / `paypal.ts`).
2. **Vercel env proof** — PayPal live + webhook + Resend + CORS origins.
3. **A1c BookingModal** — Salsa Attitude redirects + poll.
4. **Sandbox DoD script** — run boxes 1→3→4→2 in one sitting.
5. **Live $ smoke** — one real payment end-to-end.
6. Only then Accueil polish.

---

## Sign-off checklist (paste into pilot channel)

```
Phase A DoD — Vercel live
[ ] DoD 1 Public Pay — sandbox green
[ ] DoD 1 Public Pay — live $ smoke green
[ ] DoD 2 Accueil Tablet — FRONT_DESK evening run green
[ ] DoD 3 Waitlist Promote — Follow email received with pay link
[ ] DoD 4 Yield — cockpit Σ matches PayPal captures
[ ] RESEND_API_KEY set
[ ] PAYPAL_MODE=live + WEBHOOK_ID set
[ ] RITMOKIT_PUBLIC_ORIGINS includes studio site
[ ] BookingModal redirects to checkoutUrl

Signer: ________  Date: ________
```

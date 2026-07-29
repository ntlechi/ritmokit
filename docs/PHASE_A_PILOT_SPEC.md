# Phase A — Salsa Attitude Pilot Spec

**Status:** Execution-ready  
**Horizon:** 4–6 weeks post-signature  
**Client:** Salsa Attitude (Québec)  
**Success criteria (night one):** take payments online · enforce Lead/Follow parity · clear the 6:55 PM Accueil line

This document is the engineering contract for Phase A. Anything outside the four deliverables below is **out of scope** (unlimited passes, room rentals, merch, recital, multi-location cockpit).

---

## Scope lock

| # | Deliverable | Priority | Owner surface |
|---|-------------|----------|---------------|
| A1 | Live payment bridge (PayPal first, Stripe optional) | P0 | Public API + webhooks |
| A2 | Accueil roster / 1-tap check-in | P0 | Dashboard tablet UI |
| A3 | Waitlist auto-promotion queue | P1 | Enrollment lifecycle |
| A4 | Accurate cockpit yield math | P1 | Analytics + enrollment pricing |

**Non-goals for Phase A:** student portal, pass products, partner invite deep links, room rentals, Kompul, instructor payroll UI, SMS provider beyond a thin adapter stub.

---

## Current baseline (do not rebuild)

| Piece | Location | State |
|-------|----------|-------|
| Public schedule / availability / enroll | `src/app/api/public/*`, `src/lib/public-api/*` | Live (payments stubbed) |
| Parity engine | `src/lib/dance/parity.ts` | Live |
| Enrollment model | `prisma` `Enrollment` | `paid`, `waitlisted`, `attended`, `paymentRef` |
| Session prices | `ClassSession.priceRegular / priceCouple / priceStudent` | On model; **not** stored per enrollment |
| Checkout stub | `src/lib/public-api/payments.ts` | Returns fake URLs |
| Attendance toggle | `markAttendanceAction` + sessions admin | Manager-only, not Accueil |
| Yield math | `aggregates.ts` → `paidCount * priceRegular` | Wrong for couple/student |

---

## A1 — Live payment bridge

### Goal

`POST /api/public/enrollments` creates a **pending unpaid** seat hold → redirects to PayPal (or Stripe) → webhook marks `paid: true` → confirmation email.

### Schema additions

```prisma
enum PaymentStatus {
  NONE        // offline / waitlist hold / provider=none (default)
  PENDING     // checkout created, awaiting webhook
  PAID
  FAILED
  REFUNDED
}

enum PaymentProvider {
  PAYPAL
  STRIPE
}

enum PricingTier {
  REGULAR
  STUDENT
  COUPLE
  UNLIMITED_PASS
}

model Enrollment {
  // existing fields…
  paid           Boolean       @default(false)
  paymentRef     String?       @map("payment_ref")
  paymentStatus  PaymentStatus @default(NONE) @map("payment_status")
  pricingTier    PricingTier   @default(REGULAR) @map("pricing_tier")
  amountCad      Decimal?      @map("amount_cad") @db.Decimal(10, 2)
  paidAt         DateTime?     @map("paid_at")
  waitlistedAt   DateTime?     @map("waitlisted_at") // set when waitlisted=true
  promotedAt     DateTime?     @map("promoted_at")
  // …
  paymentEvents  PaymentEvent[]
}

model PaymentEvent {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  enrollmentId  String   @map("enrollment_id") @db.Uuid
  enrollment    Enrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  provider      String   // paypal | stripe
  externalId    String   @map("external_id") // PayPal capture / Stripe session id
  eventType     String   @map("event_type") // checkout.created | payment.captured | …
  payloadJson   Json     @map("payload_json")
  createdAt     DateTime @default(now()) @map("created_at")

  @@unique([provider, externalId, eventType])
  @@index([enrollmentId, createdAt])
  @@map("payment_events")
}
```

Migration: `prisma/migrations/YYYYMMDDHHMMSS_phase_a_payments_waitlist/migration.sql`

Backfill:

- `paymentStatus = PAID` where `paid = true`, else `NONE`
- `pricingTier = REGULAR`, `amountCad = session.price_regular` for existing rows
- `waitlistedAt = created_at` where `waitlisted = true`

### API contract changes

#### `POST /api/public/enrollments`

Extend body (backward compatible):

```ts
{
  // existing…
  pricingTier?: "REGULAR" | "COUPLE" | "STUDENT"; // default REGULAR
  paymentProvider?: "paypal" | "stripe" | "none";
  returnUrl?: string;
  cancelUrl?: string;
}
```

Server steps (transactional):

1. Resolve amount from session:
   - `REGULAR` → `priceRegular`
   - `COUPLE` → `priceCouple ?? priceRegular`
   - `STUDENT` → `priceStudent ?? priceRegular`
2. Parity check (unchanged).
3. Create enrollment with `paid: false`, `paymentStatus: PENDING` (or `NONE` if waitlisted / provider=none), `amountCad`, `pricingTier`, `waitlistedAt` if waitlisted.
4. If **not** waitlisted and provider ≠ `none`:
   - Call real `createEnrollmentCheckout` → store `paymentRef`
   - Persist `PaymentEvent(checkout.created)`
5. Return `{ enrollmentId, waitlisted, paid, payment: { checkoutUrl, paymentRef, status } }`.

**Waitlisted enrollments do not open checkout** until promotion (A3).

#### New routes

| Route | Purpose |
|-------|---------|
| `POST /api/webhooks/paypal` | Verify PayPal signature → capture → mark paid → promote waitlist |
| `POST /api/public/enrollments/[id]/checkout` | Regenerate PayPal approve URL |
| `GET /api/public/enrollments/[id]/payment-status` | Poll for BookingModal return page |

#### `markEnrollmentPaid(enrollmentId, { provider, externalId, payload })`

Shared helper used by both webhooks:

```
1. Idempotent: if PaymentEvent unique hit → return already paid
2. Update Enrollment: paid=true, paymentStatus=PAID, paidAt=now(), paymentRef=externalId
3. Insert PaymentEvent(payment.captured)
4. Send confirmation email (Resend / SMTP)
5. enqueueAgentTask enrollment.paid
6. Call tryPromoteWaitlist(sessionId)  // A3 — opposite role may unlock seats
```

### PayPal wiring (pilot default)

Env (Vercel Production):

```
RITMOKIT_PUBLIC_PAYMENT_PROVIDER=paypal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODE=live|sandbox
NEXT_PUBLIC_APP_URL=https://app.ritmokit.com   # or ritmokit.vercel.app
```

Replace stub in `src/lib/public-api/payments.ts`:

- Create PayPal Order (CAD) with `custom_id = enrollmentId`
- `checkoutUrl` = approve link
- Webhook handles `CHECKOUT.ORDER.APPROVED` / `PAYMENT.CAPTURE.COMPLETED`

Stripe path: same interface, `Checkout Session` with `client_reference_id = enrollmentId`. Ship PayPal first for Salsa Attitude.

### Confirmation email (minimum)

Template FR/EN: course title, day/time, room, role, amount, receipt ref.  
Adapter: `src/lib/notifications/email.ts` (Resend). If `RESEND_API_KEY` missing, log + no-op (do not fail webhook).

### Acceptance tests

- [ ] Enroll Lead REGULAR → PayPal sandbox → webhook → `paid=true`
- [ ] Duplicate webhook does not double-charge / double-write
- [ ] Waitlisted Follow → no checkout URL
- [ ] `provider=none` still creates unpaid hold (offline Accueil)

---

## A2 — Accueil roster view (1-tap check-in)

### Goal

Reception tablet at 18:55 shows **today’s classes**, live Lead/Follow counts, and 1-tap check-in — no sessions admin maze.

### Route & RBAC

| Item | Value |
|------|-------|
| Path | `/[lang]/accueil` |
| Roles | `OWNER`, `MANAGER`, `FRONT_DESK`, `ADMIN` |
| Layout | Full-bleed tablet (reuse tablet chrome patterns; hide dense sidebar on `max-width` if needed) |
| Nav | Add “Accueil” under main ops nav (FR: Accueil · EN: Front desk · ES: Recepción) |

### Data layer

New: `src/lib/data/accueil-roster.ts`

```ts
getAccueilRosterForUser(userId, { date?: Date }): Promise<{
  locationId: string;
  locationName: string;
  date: string; // YYYY-MM-DD America/Toronto
  classes: AccueilClassCard[];
}>

type AccueilClassCard = {
  sessionId: string;
  courseTitle: string;
  style: string;
  roomName: string;
  roomColorHex: string;
  startTime: string; // ISO
  endTime: string;
  instructorName: string;
  leads: { filled: number; max: number; present: number };
  follows: { filled: number; max: number; present: number };
  waitlistedCount: number;
  roster: AccueilRosterRow[];
}

type AccueilRosterRow = {
  enrollmentId: string;
  studentName: string;
  studentEmail: string;
  danceRole: "LEAD" | "FOLLOW" | "SOLO";
  paid: boolean;
  waitlisted: boolean;
  attended: boolean;
  pricingTier: PricingTier;
}
```

Query rules:

- Sessions for the user’s primary location where **local calendar day** matches `date` (use location timezone, default `America/Toronto`).
- For recurring `dayOfWeek` sessions: include if `dayOfWeek === today’s DOW` and season is ACTIVE.
- Roster: `waitlisted: false` first (active seats), waitlisted section collapsed below.
- Sort classes by `startTime` ascending; highlight “now / next 90 min”.

### UI components

| File | Role |
|------|------|
| `src/app/[lang]/(dashboard)/accueil/page.tsx` | Server page + auth |
| `src/components/accueil/accueil-roster.tsx` | Client tablet UI |
| `src/components/accueil/class-timeline.tsx` | Horizontal / vertical timeline of today’s slots |
| `src/components/accueil/check-in-row.tsx` | Name · role chip · paid badge · big Check-in button |

**Interaction:**

- Tap class → expand roster (default: expand next upcoming class).
- Tap **Présenta** / **Check-in** → optimistic toggle → `markAttendanceAction({ enrollmentId, attended: true })`.
- Tap again to undo (`attended: false`).
- Unpaid active seat: amber badge “À encaisser” (Accueil can still check in; do not block).
- Waitlisted: grey row, no check-in until promoted.
- Live Lead/Follow meters at top of each class card (reuse `DivergingBar` / counts).

### Server action polish

Extend `markAttendanceAction`:

- Authorize Accueil roles (not only manager sessions page).
- `revalidatePath(\`/${lang}/accueil\`)`.
- Optional: set `attendedAt` (add column if useful for audits — nice-to-have, not blocking).

### Acceptance tests

- [ ] FRONT_DESK user opens `/fr/accueil` on iPad width → next class expanded
- [ ] 1 tap marks attended in <300ms perceived (optimistic UI)
- [ ] Lead/Follow present counts update without full page reload
- [ ] Waitlisted students not check-in-able

---

## A3 — Waitlist auto-promotion queue

### Goal

When a Lead enrolls into a role-locked class, the earliest waitlisted Follow is promoted to an active seat and invited to pay (email link). Symmetric for Follow → promote Lead.

### Core algorithm

New: `src/lib/dance/waitlist-promote.ts`

```ts
async function tryPromoteWaitlist(sessionId: string): Promise<PromoteResult[]>
```

Called from:

1. End of `createPublicEnrollment` (after successful non-waitlisted enroll)
2. End of `markEnrollmentPaid` (paid seat may change capacity semantics — usually same)
3. Manager `enrollStudentAction` when not waitlisted

**Promotion rules (single transaction):**

1. Reload capacity ignoring waitlisted rows.
2. Find opposite role: if new enrollee is `LEAD` → promote `FOLLOW`; if `FOLLOW` → promote `LEAD`. (`SOLO` → no-op.)
3. Select candidate:

   ```
   WHERE sessionId = ? AND waitlisted = true AND danceRole = ?
   ORDER BY waitlistedAt ASC NULLS LAST, createdAt ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED
   ```

4. Re-run `evaluateParityEnrollment` as if promoting that candidate **without** waitlist fallback. If would still be blocked → stop (no promote).
5. Update candidate: `waitlisted=false`, `promotedAt=now()`, `waitlistedAt=null`.
6. If `paid=false`: create PayPal checkout → email “Votre place est débloquée — payer ici” with `checkoutUrl`. Set `paymentStatus=PENDING`.
7. If already paid (edge): just notify “Vous êtes inscrit·e”.
8. Emit `enrollment.waitlist_promoted` agent event.
9. Loop once more (max 3 promotions per trigger) while parity allows — typically 1.

**Do not promote** if role capacity full or imbalance would exceed engine tolerance after promote.

### Public API for promoted payment

Reuse checkout creation; BookingModal / email link:

`GET /api/public/enrollments/[id]/checkout` — regenerates PayPal link if still `PENDING` and unpaid.

### Notifications

| Event | Channel | Copy key |
|-------|---------|----------|
| Promoted + unpaid | Email (SMS stub optional) | `waitlist.promotedPay` |
| Promoted + paid | Email | `waitlist.promotedConfirmed` |

SMS: interface `sendSms(to, body)` no-op unless `TWILIO_*` set — do not block Phase A on Twilio.

### Acceptance tests

- [ ] Class: 4 Leads, 6 Follows waitlisted → new Lead enrolls → oldest Follow promoted + email queued
- [ ] Promote respects `ORDER BY waitlistedAt`
- [ ] Concurrent Lead enrollments do not promote the same Follow twice (`SKIP LOCKED`)
- [ ] Parity still blocks if promote would imbalance beyond rule

---

## A4 — Accurate cockpit yield math

### Goal

Steve trusts **Profit / cours** and **$/m²** because revenue uses the tier the student actually bought.

### Data path

1. Every enrollment stores `pricingTier` + `amountCad` (A1).
2. `loadDanceAnalyticsForLocation` selects those fields.
3. Replace in `aggregates.ts`:

```ts
// BEFORE
paidCount * row.priceRegular

// AFTER
revenue = sum(e.amountCad for e where e.paid && !e.waitlisted)
// fallback if amountCad null: tier price from session
```

Blocked revenue:

```ts
blockedRevenue = sum(expectedAmount(session, e.pricingTier) for waitlisted e)
// or priceRegular if tier unknown
```

4. `calculateClassEconomics` accepts `revenue: number` directly (or keep count API but prefer explicit revenue).

### Couple accounting note (Phase A rule)

- **Couple tier** on a single enrollment counts as **one seat / one role** for parity, and **one `amountCad`** (= couple price) for revenue.
- Do **not** invent a second partner enrollment in Phase A. Document this for Steve; partner-linking is Phase B.

### Acceptance tests

- [ ] Mix of REGULAR / STUDENT / COUPLE paid seats → cockpit revenue matches sum of `amountCad`
- [ ] Bottom-10% profit matrix reorders when student discounts applied
- [ ] Seed script updated to set realistic tiers on demo enrollments

---

## File / PR breakdown (suggested)

| PR | Contents | Days |
|----|----------|------|
| **A1a** | Migration + Enrollment payment fields + PaymentEvent | 1 |
| **A1b** | Real PayPal checkout + webhook + email adapter | 3–4 |
| **A1c** | Salsa Attitude BookingModal: redirect + poll payment-status | 1–2 |
| **A2** | Accueil data + page + tablet UI + nav | 3–4 |
| **A3** | `tryPromoteWaitlist` + hooks + promote email | 2–3 |
| **A4** | Analytics revenue from `amountCad` + seed fix | 1–2 |

Total: ~11–16 eng-days → fits 4–6 calendar weeks with buffer for PayPal live credentials and Steve UAT.

---

## Env checklist (Production)

```
# Payments
RITMOKIT_PUBLIC_PAYMENT_PROVIDER=paypal
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYPAL_MODE=live

# App
NEXT_PUBLIC_APP_URL=https://…

# Email
RESEND_API_KEY=
EMAIL_FROM=inscriptions@ritmokit.com

# CORS (already)
RITMOKIT_PUBLIC_ORIGINS=https://salsa-attitude.vercel.app,https://salsaquebec.com,https://www.salsaquebec.com
```

---

## Steve framing (ready to paste)

> Steve, le cœur de RitmoKit — la gestion de la parité, la grille horaire et l’API publique — est déjà connecté à votre nouveau site. Dès la signature, on active la **Phase A** : prise de paiement en ligne (PayPal), guichet d’accueil 1-clic pour vos employés à 19 h, et promotion automatique des listes d’attente Lead/Follow. Le reste du roadmap (pass illimité, locations de salle, multi-studios) arrive ensuite, une fois ces trois gestes opérationnels sans friction.

---

## Definition of Done (Phase A)

1. A student can pay for a Salsa Attitude class on the public site without DMing the studio.
2. Accueil staff can check in a full evening class from a tablet without opening Sessions admin.
3. A new Lead automatically unlocks the oldest waitlisted Follow and emails a pay link.
4. Ops Studio revenue for that week matches the sum of paid enrollment amounts (spot-check vs PayPal).

When all four boxes are green, Phase A ships. Everything else waits.

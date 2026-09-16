# RitmoKit — Backend Hardening Audit (18:58 rush)

Scope: `src/lib/**`, `/api/public/*`, `/api/studio/*`, the `/accueil` door flow,
Interac reconciliation, `Clôture de caisse`, and Loi 25 lifecycle.
Target: financial-grade determinism, no over-allocation under concurrency,
no cross-tenant leakage, sub-50 ms p95 on door paths.

Legend — **RC** race condition · **IDX** missing index · **LOCK** lock contention ·
**TEN** tenant boundary · **FIN** money determinism · **PII** privacy.

---

## 1. Parity engine & booking invariants

| # | Finding (before) | Severity | Fix (after) |
|---|---|---|---|
| 1.1 | **RC** `createPublicEnrollment` read capacity with `findMany` *outside* any lock, then inserted. 20 Follows racing for 2 seats all saw `followsFree = 2` and all inserted → over-allocation and Δ > `MAX_IMBALANCE`. | Critical | `src/lib/dance/seat-allocator.ts`: every seat mutation runs in one interactive transaction that first executes `SELECT … FROM class_sessions … ORDER BY id FOR UPDATE OF cs` (`lockSessions`). Capacity is re-counted under the lock (`loadLockedCapacity`), the parity decision is taken there, and the insert happens before commit. Twenty writers serialize on one 16-byte row; 2 seat, 18 waitlist/refuse. Package siblings lock in sorted id order → no deadlock between overlapping packages. |
| 1.2 | **RC** Same read-then-write in `walkInAtDoorAction`, `enrollStudentAction`, `promoteOne` (waitlist promotion). A promotion racing with a public booking could seat both. | Critical | All four writers go through the same allocator (`allocateSeat`, `allocateCouple`, `seatWaitlisted`) and the same row lock. There is exactly one code path that can create a seated enrollment. |
| 1.3 | **RC** Couple booking inserted Lead then Follow as two independent decisions; a concurrent single Follow could take the partner's seat between them. | High | `allocateCouple` pre-checks `evaluateCoupleEnrollment` under lock, then seats both with `presized: true` against the same in-memory `RoleCapacity` (bumped after each insert). Type `PlacedSeat` excludes `refused` so callers can't ignore a half-seated couple. |
| 1.4 | Idempotency: `@@unique([sessionId, studentId])` existed, but a duplicate POST surfaced as P2002 → 500, and a retry after a flaky LTE resend produced `409 already_enrolled` with no way to recover the checkout URL. | High | Allocator reads the existing seat under lock and returns `kind: "existing"`. Public route: inside `ENROLL_REPLAY_WINDOW_MS` (10 min) the request is treated as a network retry → `200` with `replayed: true`, original `ticketCode`, and a regenerated checkout if unpaid. Past the window → `409`. The `(sessionId, studentId)` key is the idempotency key; role is *not* part of it on purpose (one dancer, one seat per class). |
| 1.5 | `RoleCapacity` ignored SOLO enrollments; a fitness class of 12 solos + 0L/0F reported 24 free seats. | High | `filledSolos` added; `poolFree()` is the single source of truth for room capacity, and `leadsFree/followsFree` are clamped by it. Covered in `scripts/test-backend-hardening.mjs`. |
| 1.6 | `publicEnrollSchema` accepted `markPaid` and `paymentRef` from anonymous clients. | **Critical (security)** | Removed; schema is `.strip()`. Payment truth enters only via provider webhooks, the Interac queue, or the front desk. |

Why pessimistic row lock rather than `SERIALIZABLE`: SERIALIZABLE turns the rush
into a retry storm (40 aborts/s at 18:58) and Prisma doesn't retry for you. A
`FOR UPDATE` on the session row costs one index lookup, serializes only writers of
*that class*, and leaves reads (`/accueil` roster, public schedule) unblocked.

`SEAT_TX_OPTIONS = { maxWait: 4 s, timeout: 8 s }` bounds the wait; a tablet on
basement Wi-Fi gets a clean error rather than a hung request.

---

## 2. Door flow (`/accueil`) & database integrity

| # | Finding | Severity | Fix |
|---|---|---|---|
| 2.1 | `class_attendance` already has `@@unique([enrollmentId, occurredOn])` — double-pointage is impossible at the DB layer. But `markAttendanceAction` did `findUnique` → `create` and mapped the P2002 to a generic error. | Medium | Conditional `updateMany`/`createMany({ skipDuplicates })`; the action returns `{ ok: true, alreadyAttended: true }` so the tablet shows *Déjà pointé* without a round-trip failure. Progression recompute is deferred with `after()` — the response no longer waits on it. |
| 2.2 | **LOCK** Progression recompute and waitlist promotion ran *inside* the request path after check-in / walk-in. | Medium | Both moved to `after()`; door mutation commits in one short transaction. |
| 2.3 | **IDX** `ticketCode` is `@unique` → instant 4-char lookup already B-tree backed. Missing: `enrollments(student_id)` (FK with no index → seq scan on progression recompute and every student page), `enrollments(payment_provider, paid_at)` and `(payment_provider, payment_pending_at)` (caisse aggregates). | High | `prisma/migrations/20260902230000_hardening_indexes` + runtime bootstrap in `ensureStudioOsSchema` (`IF NOT EXISTS`, idempotent). Composite indexes `(sessionId, danceRole, waitlisted)`, `(sessionId, paymentStatus, paid)`, `(sessionId, waitlisted, waitlistedAt)` already existed and are the ones the allocator's `GROUP BY` hits. |
| 2.4 | N+1 in `getAccueilRosterForUser`: one `studentProgression` and one `courseLesson` query per row; filtering by weekday happened in JS after an unbounded `findMany` over the whole season. | High | Day filter pushed into SQL (`dayOfWeek` / `startTime` range); `select` narrowed to what the row renders; progression + lesson lookups batched with `in:`. Rows now carry ~12 scalar fields instead of nested `course`/`room`/`season` objects; a 6-class, 90-row night should sit well under the 25 KB gzipped budget (measure with `curl --compressed -w '%{size_download}'` against `/accueil` once deployed). |
| 2.5 | `releaseEnrollmentSeatAction` deleted **paid** enrollments (cascade → `payment_events`). | Critical (FIN) | Guard `if (enrollment.paid) → already_paid` and conditional `deleteMany({ id, paid: false })`. UI maps the error to `interac.errors.alreadyPaid`. |
| 2.6 | Optimistic PRÉSENT rollback restored a whole-roster snapshot; two taps in flight → the first rollback reverted the second row too. | Medium | `accueil-roster.tsx#onToggle`: rollback is the *inverse* `applyOptimistic(prev, id, !next)` applied on current state; an `inflight` set drops duplicate taps. Pattern documented in §5. |

---

## 3. Interac FIFO & Clôture de caisse

| # | Finding | Severity | Fix |
|---|---|---|---|
| 3.1 | **RC** `markEnrollmentPaid`: `paymentEvent.create` then `enrollment.update` as two statements; two tablets confirming the same `RK|…` code both flipped to PAID and both sent the confirmation email / agent event. | Critical (FIN) | Single transaction: `paymentEvent.createMany({ skipDuplicates })` on `@@unique([provider, externalTransactionId, eventType])`, then `enrollment.updateMany({ where: { id, paid: false } })`. Only the writer with `count === 1` runs side effects. Second tablet gets `alreadyPaid` — no double credit. |
| 3.2 | **RC** `cancelInteracEnrollment` did an unconditional update; confirm ∥ cancel could overwrite a PAID row with CANCELLED. | Critical (FIN) | Conditional `updateMany({ where: { id, paid: false, paymentStatus: { in: [PENDING, PENDING_INTERAC] } } })`; on `count === 0` the row is re-read to return a precise error (`already_paid` / `already_cancelled`). |
| 3.3 | **FIN** Cash drawer summed `Decimal` → `Number` in JS (`reduce((a, b) => a + Number(b.amountCad))`), and variance was `counted - expected` on floats. | High | `src/lib/money/cents.ts`: `toCents` (half-up via exact decimal expansion, handles Prisma `Decimal`, strings, numbers), `sumCents`, `isWholeCents`. Cash/Interac totals now come from SQL `aggregate({ _sum })` and are converted once. `closeCashDrawerAction` validates inputs with `isWholeCents` and computes `expected/variance/deposit` in integer cents. |
| 3.4 | **TEN** Any OWNER/ADMIN could close the drawer of *any* location on the platform. | Critical (TEN) | `canAccessLocation(user, locationId)`; `@@unique([locationId, businessDate])` P2002 → `already_closed` (idempotent second tap). |

---

## 4. Multi-tenant boundary & Loi 25

| # | Finding | Severity | Fix |
|---|---|---|---|
| 4.1 | **TEN** `RITMOKIT_STUDIO_ROSTER_SECRET` was one platform-wide bearer: Salsa Attitude's proxy could pass Studio B's `locationId` and pull its roster + student emails. | **Critical** | Tenant-bound tokens `rk1.<orgSlug>.<HMAC-SHA256(secret, slug)[0:32]>` (`src/lib/studio-api/roster-token.ts`, constant-time compare). `resolveStudioLocationId` refuses a `locationId` outside the token's organisation. Legacy bare secret accepted only when `RITMOKIT_STUDIO_ROSTER_ORG` pins it, or outside production. `npm run roster-token -- salsa-attitude` prints a tenant's token; the secret never leaves the platform. |
| 4.2 | **TEN** Open redirect: `returnUrl`/`cancelUrl` from the public client were passed to PayPal/Stripe verbatim. | High | `isAllowedReturnUrl` — exact-origin match against Integration Hub `allowedOrigins` ∪ platform env; rejects userinfo tricks, `javascript:`, protocol-relative and suffix-spoofed hosts. Falls back to the tenant base URL. |
| 4.3 | **TEN** Staff actions (`markAttendance`, `enrollStudent`, `releaseSeat`, `walkIn`, `confirmInterac`) checked *role* but not *location*. | Critical | `src/lib/dance/tenant-scope.ts`: `staffScope(user)` → accessible `locationIds`; `sessionScopeWhere` / `enrollmentScopeWhere` are ANDed into every mutation's `where`, so a foreign id is simply *not found*. |
| 4.4 | Public `payment-status` and `checkout` routes had no rate limit; `checkout` was an unauthenticated enumeration oracle. | Medium | 120/min and 10/min per IP respectively (`checkRateLimit`). Enrollment ids are UUIDv4 (unguessable) and the payload exposes payment status, amount and ticket code only — no name, email or phone. |
| 4.5 | **PII** No erasure path. `User` → `Enrollment` → `PaymentEvent` cascade on delete, so honouring a Loi 25 request destroyed the ledger. | High | `src/lib/privacy/anonymize-student.ts`: **pseudonymize, never delete**. Identity columns replaced by a deterministic stand-in (`retire.<sha256(id)[0:16]>@anon.ritmokit.invalid`), phone/photo/bio cleared, `interacReferenceHint` nulled, `payment_events.payload` redacted (payer email lives there), `student_notes` deleted, `instructorNote` nulled. Amounts, statuses, dates and event ids untouched → fiscal retention intact. Tenant rule: a studio may only retire a student whose *every* enrollment is inside its locations (`shared_across_tenants` otherwise — `users.email` is global). |
| 4.7 | **TEN** `resolvePublicLocation` by `locationSlug` without `organizationSlug` used `findFirst` on a slug that is only unique per organisation — two studios with a `montreal` location resolved by row order. | Medium | `findMany({ take: 2 })`; anything other than exactly one match returns `null` (fail closed). Headless clients should always send `organizationSlug`. |
| 4.6 | **PII** No automated retention. | High | `sweepInactiveStudents` (default 3 years, batch ≤ 1000, never touches students with pending money) behind `/api/cron/privacy-retention` (constant-time `CRON_SECRET` compare), scheduled daily 08:30 UTC in `vercel.json`. Idempotent: already-anonymized rows are excluded by email domain. |

---

## 5. Optimistic PRÉSENT contract (client ⇄ server)

```
tap(row, next)
  if row ∈ inflight → drop (server is idempotent; this only avoids flicker)
  inflight += row
  state ← applyOptimistic(state, row, next)          // pure, idempotent, symmetric
  result ← markAttendanceAction({ enrollmentId, attended: next })
  ok, alreadyAttended:false → keep; router.refresh() reconciles counts
  ok, alreadyAttended:true  → keep; flash "Déjà pointé"
  !ok / network error       → state ← applyOptimistic(state, row, ¬next)   // inverse on *current* state
  inflight -= row
```

Determinism guarantees: (a) rollback never touches other rows; (b) two taps on
the same row collapse to one request; (c) the server's `updateMany` conditional
means an out-of-order retry can never un-check a dancer someone else checked in.

---

## 6. Schema delta (applied)

```prisma
model Enrollment {
  // …
  @@unique([sessionId, studentId])                 // idempotency key
  @@index([sessionId, danceRole, waitlisted])      // allocator GROUP BY under lock
  @@index([sessionId, paymentStatus, paid])
  @@index([sessionId, waitlisted, waitlistedAt])   // FIFO promotion
  @@index([paymentStatus, paymentPendingAt])       // Interac queue
  @@index([studentId])                             // NEW — FK, progression, erasure
  @@index([paymentProvider, paidAt])               // NEW — caisse cash SUM
  @@index([paymentProvider, paymentPendingAt])     // NEW — caisse Interac announced
}
```

Migration: `prisma/migrations/20260902230000_hardening_indexes/migration.sql`
(`CREATE INDEX IF NOT EXISTS`, also applied at runtime by `ensureStudioOsSchema`).
On a large `enrollments` table run `CREATE INDEX CONCURRENTLY` out-of-band first;
the migration then no-ops.

---

## 7. Latency budget on the hot paths (Supabase yul1, pooled)

Statement counts are exact; the p95 column is a budget derived from ~3–5 ms per
pooled round trip and must be confirmed with the k6 suite (`npm run test:load`).

| Path | Statements | p95 budget |
|---|---|---|
| Check-in (`markAttendanceAction`) | 1 scoped `findFirst` + 1 conditional `updateMany` (+ `after()`) | 12–18 ms |
| Walk-in cash (`walkInAtDoorAction`) | upsert user · lock session · count · insert · payment_event → 1 tx | 25–40 ms |
| Public enrol (single) | upsert user · lock · count · insert → 1 tx, checkout after commit | 30–45 ms + provider |
| Interac confirm | 1 tx: `createMany skipDuplicates` + conditional `updateMany` | 10–15 ms |
| `/accueil` hydration (6 classes, 90 rows) | 1 session query + 2 batched lookups | 35–50 ms TTFB |

---

## 8. Verification

```
npx tsc --noEmit            # clean
npm run test:parity         # parity asserts OK
npm run test:interac        # OK
npm run test:public-api     # OK
npm run test:hardening      # solos-in-pool, 20-Follow race, cents, pseudonym, open-redirect, rk1 token
```

Pre-existing, out of scope: two `react-hooks/set-state-in-effect` lint errors in
`accueil-roster.tsx` (search-highlight effect, present at HEAD).

---

## 9. Residual risks / recommended follow-ups

1. **`users.email` is platform-global.** One dancer at two studios is one row; a
   studio can see a name it didn't collect via the shared user. Proper fix is a
   per-organisation `StudentProfile` with the identity, and `users` reduced to
   auth. Until then `anonymizeStudent` refuses cross-tenant rows.
2. **RLS is not enabled** on Supabase tables; isolation is enforced in the
   application layer (`staffScope`). Enabling RLS with `organization_id` policies
   would make the boundary defence-in-depth. Note `class_sessions` reaches its
   location via `season` *or* `room` — an `organization_id` column denormalised
   onto `enrollments` would make both RLS and the `(organizationId, status, startsAt)`
   index from the brief possible.
3. Other cron routes (`schema-bootstrap`, `autopilot`, `dance-agentics`) compare
   `CRON_SECRET` with `!==`; port them to the `timingSafeEqual` helper used in
   `privacy-retention`.
4. Rate limiting is per-instance memory; behind multiple Vercel instances the
   effective limit is N× the configured value. Move to Upstash/KV if abuse appears.
5. **CORS allowlist is the union of every organisation's `allowedOrigins`**
   (`resolver.ts#getHubAllowedOrigins`). Because the public API is credential-less
   and every response is already location-scoped, this is not a data leak — Studio A's
   site can read Studio B's *public* schedule, which it could also read with `curl`.
   It does mean one tenant's misconfigured origin widens the browser surface for all.
   Resolving the allowlist per request tenant would tighten it; low priority.
6. Set `RITMOKIT_STUDIO_ROSTER_ORG` (or rotate every proxy to `rk1` tokens) before
   the next production deploy — bare secrets are now rejected in production.

# Phase A — Sandbox UAT Script

**Purpose:** Flip DoD 1 & 3 from YELLOW → GREEN in one sitting (sandbox first), then spot-check DoD 4 & 2.  
**Companion:** [`PHASE_A_DOD_GATE.md`](./PHASE_A_DOD_GATE.md) · [`.env.production.template`](../.env.production.template)

**Target base URL (pick one):**

```text
Preview:  https://<your-vercel-preview>.vercel.app
Local:    http://localhost:3000
```

Set once:

```bash
export APP_URL="https://YOUR_PREVIEW.vercel.app"
export LOCATION_SLUG="salsa-attitude"   # or your pilot location.slug
export ORIGIN="https://salsa-attitude.vercel.app"
```

PowerShell:

```powershell
$APP_URL = "https://YOUR_PREVIEW.vercel.app"
$LOCATION_SLUG = "salsa-attitude"
$ORIGIN = "https://salsa-attitude.vercel.app"
```

---

## 0. Preflight — env & PayPal (15 min)

### 0.1 Vercel ↔ `.env.production.template` checklist

| Variable | Sandbox UAT value | ☐ |
|----------|-------------------|---|
| `NEXT_PUBLIC_APP_URL` | Preview / staging URL (no trailing slash) | ☐ |
| `RITMOKIT_PUBLIC_PAYMENT_PROVIDER` | `paypal` | ☐ |
| `PAYPAL_CLIENT_ID` | Sandbox app client id | ☐ |
| `PAYPAL_CLIENT_SECRET` | Sandbox secret | ☐ |
| `PAYPAL_WEBHOOK_ID` | Sandbox webhook id | ☐ |
| `PAYPAL_MODE` | **`sandbox`** (not `live` yet) | ☐ |
| `PAYPAL_ALLOW_STUB` | **unset** | ☐ |
| `RITMOKIT_PUBLIC_ORIGINS` | Includes `$ORIGIN` + localhost if needed | ☐ |
| `RESEND_API_KEY` | Set (DoD 3 email) | ☐ |
| `EMAIL_FROM` | e.g. `inscriptions@ritmokit.com` | ☐ |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Staging Supabase | ☐ |

### 0.2 PayPal Developer Dashboard

1. App → Sandbox credentials match Vercel.  
2. Webhooks → URL: `{NEXT_PUBLIC_APP_URL}/api/webhooks/paypal`  
3. Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`  
4. Confirm webhook shows **Enabled** after first delivery.

### 0.3 Seed a bookable UAT class

In RitmoKit `/sessions` (manager login):

1. Active season, booking open.  
2. One room class with **capacity small enough to fill Follows** for DoD 3, e.g. `maxLeads=2`, `maxFollows=2`.  
3. Prices: `priceRegular=25`, `priceStudent=20`, `priceCouple=40` (easy math for DoD 4).  
4. Note the `sessionId` (UUID) from Step 0.4 if easier via API.

### 0.4 Resolve `sessionId` from public schedule

```bash
curl -sS "$APP_URL/api/public/schedule?locationSlug=$LOCATION_SLUG" \
  -H "Origin: $ORIGIN" | jq '.classes[0] | {id, title: .courseTitle, maxLeads, maxFollows, priceRegular}'
```

PowerShell:

```powershell
curl.exe -sS "$APP_URL/api/public/schedule?locationSlug=$LOCATION_SLUG" `
  -H "Origin: $ORIGIN" | ConvertFrom-Json | Select-Object -ExpandProperty classes | Select-Object -First 1
```

```bash
export SESSION_ID="<uuid-from-above>"
```

Availability peek:

```bash
curl -sS "$APP_URL/api/public/classes/$SESSION_ID/availability" -H "Origin: $ORIGIN" | jq .
```

---

## Step 1 — DoD 1: Public Pay (PayPal sandbox → PAID)

**Pass criteria:** Enrollment reaches `paymentStatus=PAID`, `paid=true`, `amountCad` equals tier price, webhook 200, poll endpoint agrees.

### 1.1 Enroll Lead (REGULAR) → checkout URL

```bash
curl -sS -X POST "$APP_URL/api/public/enrollments" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"danceRole\": \"LEAD\",
    \"fullName\": \"UAT Lead One\",
    \"email\": \"uat.lead1+$(date +%s)@example.com\",
    \"locale\": \"fr\",
    \"pricingTier\": \"REGULAR\",
    \"paymentProvider\": \"paypal\",
    \"allowWaitlist\": true,
    \"returnUrl\": \"$APP_URL/fr/login?paid=1\",
    \"cancelUrl\": \"$APP_URL/fr/login?cancelled=1\"
  }" | tee /tmp/uat-enroll-lead1.json | jq '{enrollmentId, waitlisted, paid, checkoutUrl, payment}'
```

**Expect:**

- HTTP `201`
- `waitlisted: false`
- `paid: false`
- `checkoutUrl` starts with `https://www.sandbox.paypal.com/...`
- `payment.status` ≈ `pending`

```bash
export ENROLL_LEAD1=$(jq -r .enrollmentId /tmp/uat-enroll-lead1.json)
export CHECKOUT_URL=$(jq -r .checkoutUrl /tmp/uat-enroll-lead1.json)
echo "$ENROLL_LEAD1"
echo "$CHECKOUT_URL"
```

**Fail if:** `checkoutUrl` is `null` → check `RITMOKIT_PUBLIC_PAYMENT_PROVIDER`, PayPal creds, amount > 0.

### 1.2 Complete PayPal sandbox payment

1. Open `$CHECKOUT_URL` in a browser.  
2. Pay with a **Sandbox Personal** buyer account.  
3. Approve the order (return page may be raw JSON / login — OK for API UAT).

### 1.3 Confirm webhook + DB

Poll payment status (BookingModal path):

```bash
curl -sS "$APP_URL/api/public/enrollments/$ENROLL_LEAD1/payment-status" \
  -H "Origin: $ORIGIN" | jq .
```

**Expect:**

```json
{
  "ok": true,
  "paid": true,
  "paymentStatus": "PAID",
  "amountCad": 25,
  "waitlisted": false
}
```

SQL spot-check (Supabase SQL editor / `psql`):

```sql
SELECT id, paid, payment_status, amount_cad, payment_ref, paid_at
FROM enrollments
WHERE id = '<ENROLL_LEAD1>';

SELECT provider, external_transaction_id, event_type, created_at
FROM payment_events
WHERE enrollment_id = '<ENROLL_LEAD1>'
ORDER BY created_at;
```

PayPal Dashboard → Webhooks → recent delivery **HTTP 200**.

### 1.4 Idempotency (replay)

In PayPal webhook simulator / “Resend”, replay the same event.

**Expect:** API still `paid: true`; no double charge; second processing returns `alreadyProcessed` (check Vercel function logs).

### 1.5 Optional: STUDENT tier (feeds DoD 4)

```bash
curl -sS -X POST "$APP_URL/api/public/enrollments" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"danceRole\": \"LEAD\",
    \"fullName\": \"UAT Lead Student\",
    \"email\": \"uat.lead.student+$(date +%s)@example.com\",
    \"pricingTier\": \"STUDENT\",
    \"paymentProvider\": \"paypal\",
    \"returnUrl\": \"$APP_URL/fr/login?paid=1\",
    \"cancelUrl\": \"$APP_URL/fr/login?cancelled=1\"
  }" | tee /tmp/uat-enroll-student.json | jq '{enrollmentId, checkoutUrl}'
```

Pay sandbox → poll until `amountCad: 20`.

```bash
export ENROLL_STUDENT=$(jq -r .enrollmentId /tmp/uat-enroll-student.json)
```

### DoD 1 sign-off

```
[ ] checkoutUrl issued
[ ] Sandbox payment completed
[ ] payment-status → PAID + correct amountCad
[ ] payment_events row present
[ ] Webhook delivery 200
[ ] Replay does not break PAID
```

---

## Step 2 — DoD 3: Waitlist Auto-Promote + Resend

**Pass criteria:** Oldest waitlisted Follow is promoted; Resend delivers (or Resend dashboard shows) pay-link email; Follow can open checkout.

### 2.1 Prepare capacity (Follows full, waitlist)

Use a class with `maxFollows=2` (or fill whatever max is). Enroll Follows with **offline paid holds** so seats are seated without PayPal noise:

```bash
# Follow A — seated, markPaid (manager-style hold for UAT)
curl -sS -X POST "$APP_URL/api/public/enrollments" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"danceRole\": \"FOLLOW\",
    \"fullName\": \"UAT Follow A\",
    \"email\": \"uat.follow.a+$(date +%s)@example.com\",
    \"paymentProvider\": \"none\",
    \"markPaid\": true,
    \"allowWaitlist\": true
  }" | jq '{enrollmentId, waitlisted, paid}'

# Follow B — seated
curl -sS -X POST "$APP_URL/api/public/enrollments" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"danceRole\": \"FOLLOW\",
    \"fullName\": \"UAT Follow B\",
    \"email\": \"uat.follow.b+$(date +%s)@example.com\",
    \"paymentProvider\": \"none\",
    \"markPaid\": true,
    \"allowWaitlist\": true
  }" | jq '{enrollmentId, waitlisted, paid}'
```

**Expect:** both `waitlisted: false`, `paid: true`.

### 2.2 Put Follow C on waitlist (oldest waiter)

Use a **real inbox you control** (Gmail) so Resend can deliver:

```bash
export WAITLIST_EMAIL="your.real.inbox+uat.waitlist@gmail.com"

curl -sS -X POST "$APP_URL/api/public/enrollments" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"danceRole\": \"FOLLOW\",
    \"fullName\": \"UAT Follow Waitlist\",
    \"email\": \"$WAITLIST_EMAIL\",
    \"locale\": \"fr\",
    \"paymentProvider\": \"none\",
    \"allowWaitlist\": true
  }" | tee /tmp/uat-waitlist.json | jq '{enrollmentId, waitlisted, checkoutUrl, paid}'
```

**Expect:** `waitlisted: true`, `checkoutUrl: null`.

```bash
export ENROLL_WAITLIST=$(jq -r .enrollmentId /tmp/uat-waitlist.json)
```

### 2.3 Enroll + pay a Lead → triggers promote

```bash
curl -sS -X POST "$APP_URL/api/public/enrollments" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"danceRole\": \"LEAD\",
    \"fullName\": \"UAT Lead Promoter\",
    \"email\": \"uat.lead.promoter+$(date +%s)@example.com\",
    \"pricingTier\": \"REGULAR\",
    \"paymentProvider\": \"paypal\",
    \"returnUrl\": \"$APP_URL/fr/login?paid=1\",
    \"cancelUrl\": \"$APP_URL/fr/login?cancelled=1\"
  }" | tee /tmp/uat-lead-promote.json | jq '{enrollmentId, checkoutUrl}'
```

Complete PayPal sandbox for that Lead (promote also runs on seated create; **pay anyway** so DoD 1 path stays warm).

### 2.4 Verify waitlist Follow was promoted

```bash
curl -sS "$APP_URL/api/public/enrollments/$ENROLL_WAITLIST/payment-status" \
  -H "Origin: $ORIGIN" | jq .
```

SQL:

```sql
SELECT id, waitlisted, promoted_at, payment_status, payment_ref, amount_cad
FROM enrollments
WHERE id = '<ENROLL_WAITLIST>';
```

**Expect:**

- `waitlisted = false`
- `promoted_at` not null
- `payment_status = PENDING` (awaiting Follow payment)
- `payment_ref` set (PayPal order)

### 2.5 Verify Resend email

1. Resend Dashboard → Emails → latest to `$WAITLIST_EMAIL`.  
2. Subject contains course title / “place s'est libérée” / “spot opened”.  
3. Body contains PayPal **sandbox** approve URL.  
4. Open link → Follow can pay → poll until `PAID`.

Vercel logs (if Resend missing):

```text
[email:stub] { kind: "waitlist_promoted_pay", ... }  → FAIL DoD 3
```

### DoD 3 sign-off

```
[ ] Follow waitlisted with checkoutUrl null
[ ] Lead seated/paid
[ ] Waitlisted Follow: waitlisted=false + promoted_at
[ ] Resend shows waitlist_promoted_pay (not stub)
[ ] Pay link completes → PAID
```

---

## Step 3 — DoD 4: Yield / cockpit matches Σ amountCad

**Note:** There is **no** `/api/cockpit` public route. Verify via SQL + manager Cockpit UI (`/[lang]/dashboard`).

### 3.1 Sum paid seats for the UAT session

```sql
SELECT
  ROUND(SUM(amount_cad)::numeric, 2) AS sum_amount_cad,
  COUNT(*) FILTER (WHERE paid AND NOT waitlisted) AS paid_seats
FROM enrollments
WHERE session_id = '<SESSION_ID>'
  AND paid = true
  AND waitlisted = false;
```

Cross-check individual tiers from Step 1 (e.g. 25 + 20 = 45 if only those two REGULAR+STUDENT).

### 3.2 Cockpit UI

1. Login as OWNER/MANAGER.  
2. Open `/fr/dashboard` (Cockpit).  
3. Find the UAT class / week pulse / profit matrix.  
4. **Pass if** displayed revenue for that class ≈ `sum_amount_cad` (not `paid_seats × priceRegular` alone).  
5. If STUDENT paid 20 while regular is 25, revenue must **not** show 25 for that seat.

### 3.3 Optional PayPal reconciliation

Sandbox Activity → sum captures for UAT emails ≈ cockpit class revenue.

### DoD 4 sign-off

```
[ ] SQL sum_amount_cad computed
[ ] Cockpit class revenue matches (tier-aware)
[ ] Couple/student not inflated to regular
```

---

## Step 4 — DoD 2: Accueil tablet check-in

**Pass criteria:** FRONT_DESK (or manager) 1-taps the paid student to Présent without opening Sessions.

### 4.1 Roles

1. Prefer a `FRONT_DESK` user for the pilot location.  
2. Confirm `/fr/sessions` redirects away for that role.  
3. Open `/fr/accueil` at tablet width (~768–1024px, DevTools device mode).

### 4.2 UI checks

1. Today’s class appears on the timeline.  
2. Select the UAT class → Lead/Follow meters visible.  
3. Find **UAT Lead One** (or paid student from Step 1).  
4. Badge shows unpaid/pending only if still unpaid — paid seats should not block check-in.  
5. Tap **Présent** / check-in → row flips to present; meter present count increments.  
6. Refresh → attendance persists.  
7. Waitlisted-only rows (if any left) cannot be checked in.

### DoD 2 sign-off

```
[ ] Accueil loads for FRONT_DESK
[ ] Sessions blocked for FRONT_DESK
[ ] 1-tap check-in works
[ ] Meters update
[ ] Persistence after refresh
```

---

## End-of-run scoreboard

| Step | DoD | Result | Notes |
|------|-----|--------|-------|
| 1 | Public Pay | ☐ PASS / ☐ FAIL | |
| 2 | Waitlist + Resend | ☐ PASS / ☐ FAIL | |
| 3 | Yield Σ amountCad | ☐ PASS / ☐ FAIL | |
| 4 | Accueil tablet | ☐ PASS / ☐ FAIL | |

**Sandbox green** = all four PASS.  
**Then** switch `PAYPAL_MODE=live`, live credentials + webhook, one real low-amount smoke → Phase A launch gate.

---

## Troubleshooting quick map

| Symptom | Likely cause |
|---------|----------------|
| `checkoutUrl: null` on enroll | Provider=`none`, missing PayPal env, amount 0, checkout throw |
| Stays `PENDING` after pay | Webhook URL/secret wrong, `PAYPAL_WEBHOOK_ID` mismatch |
| Webhook 401 | Signature verify fail / wrong webhook id |
| Webhook 422 `capture_incomplete` | Capture not COMPLETED (expected harden from a23ae3f) |
| `[email:stub]` in logs | `RESEND_API_KEY` unset |
| Waitlist not promoted | Capacity still blocked, wrong role waiting, promote error in logs |
| CORS error from browser | Origin missing from `RITMOKIT_PUBLIC_ORIGINS` |

---

## BookingModal (A1c) — parallel checklist for Salsa Attitude

Not RitmoKit repo, but required for DoD 1 **product** green:

```
[ ] On enroll 201, redirect browser to payment.checkoutUrl
[ ] returnUrl page polls GET /api/public/enrollments/:id/payment-status
[ ] Show success when paid=true
[ ] cancelUrl shows retry → POST /api/public/enrollments/:id/checkout
```

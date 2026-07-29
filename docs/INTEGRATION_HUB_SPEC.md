# Integration Hub — Multi-Tenant Connectors

**Status:** Implemented (schema + resolver + PayPal admin UI)  
**Goal:** Per-studio payment (and future email) credentials live in the database, encrypted — not in Vercel env per tenant. Platform env is set once; studios self-serve in Manager → Integrations.

---

## 1. Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        MULTI-TENANT INTEGRATION HUB                       │
├───────────────────────────────────────────────────────────────────────────┤
│ PLATFORM (Vercel — set once)                                              │
│ ├── DATABASE_URL, Supabase, NEXT_PUBLIC_APP_URL                           │
│ ├── RITMOKIT_FIELD_ENCRYPTION_KEY  (AES-256-GCM for encryptedConfig)      │
│ ├── RESEND_API_KEY / EMAIL_FROM    (platform transactional email)         │
│ ├── RITMOKIT_PUBLIC_ORIGINS        (optional global CORS allowlist)       │
│ ├── PAYPAL_*                       (LEGACY FALLBACK only — Phase A)       │
│ └── Future: STRIPE_PLATFORM_*      (SaaS billing — studios → RitmoKit)    │
├───────────────────────────────────────────────────────────────────────────┤
│ ORGANIZATION (DB — OrganizationIntegration)                               │
│ ├── provider: PAYPAL | STRIPE | RESEND | SQUARE                           │
│ ├── status: DISCONNECTED | TESTING | CONNECTED | ERROR                    │
│ ├── encryptedConfig (AES) — clientId, secret, webhookId, mode, …          │
│ ├── allowedOrigins[] — studio website CORS whitelist                      │
│ └── optional locationId — location override (null = org-wide)             │
└───────────────────────────────────────────────────────────────────────────┘
```

**Money flow:** Class checkout → studio’s PayPal merchant (Integration Hub).  
**SaaS billing:** Studios pay RitmoKit via platform Stripe (separate; not this table).

---

## 2. Data model

`OrganizationIntegration` — see `prisma/schema.prisma`.

| Field | Notes |
|-------|--------|
| `@@unique([organizationId, provider])` | One active connector per provider per org |
| `encryptedConfig` | `enc:v1:…` via `RITMOKIT_FIELD_ENCRYPTION_KEY` |
| `allowedOrigins` | Merged into public API CORS with platform env |
| `status` | `TESTING` = sandbox OK; `CONNECTED` = live; `ERROR` after failed test |

### PayPal `encryptedConfig` JSON (plaintext before encrypt)

```json
{
  "clientId": "…",
  "clientSecret": "…",
  "webhookId": "…",
  "mode": "sandbox" | "live"
}
```

Secrets are **never** returned to the client after save (UI shows masked placeholders).

---

## 3. Resolution order

### Checkout (`createEnrollmentCheckout`)

1. Resolve `organizationId` from enrollment → `session.course.organizationId`.
2. Load `OrganizationIntegration` where `provider=PAYPAL` and status ∈ `{CONNECTED, TESTING}`.
3. Decrypt config → create PayPal order under that merchant.
4. **Fallback (Phase A):** if no DB row, use `process.env.PAYPAL_*` + `RITMOKIT_PUBLIC_PAYMENT_PROVIDER`.
5. If neither → deferred / no checkout URL (same as today).

### Webhooks (`POST /api/webhooks/paypal`)

1. Parse payload → extract `enrollmentId` (`custom_id`) when present.
2. Resolve org → verify signature with that org’s `webhookId` + credentials.
3. Else try each CONNECTED/TESTING PayPal integration (and env fallback) until verify succeeds.
4. Capture / mark PAID as today.

### CORS (`/api/public/*`)

`getPublicAllowedOrigins()` = env `RITMOKIT_PUBLIC_ORIGINS` ∪ localhost defaults ∪ **all** `OrganizationIntegration.allowedOrigins` (any non-DISCONNECTED row).

---

## 4. Admin UI

**Path:** `/{lang}/settings/manager/integrations`  
**Hub tile:** Manager Settings → Integrations.

| Control | Behavior |
|---------|----------|
| Client ID / Secret / Webhook ID | Saved encrypted |
| Mode sandbox \| live | Stored in config; maps to PayPal API host |
| Allowed origins | Comma or newline list → `allowedOrigins` |
| Tester la connexion | OAuth token against PayPal; sets `TESTING` or `CONNECTED` / `ERROR` |
| Disconnect | Clears secrets, status → `DISCONNECTED` |

Webhook URL shown to manager (copy-paste into PayPal Developer):

`{NEXT_PUBLIC_APP_URL}/api/webhooks/paypal`

---

## 5. Pilot onboarding (Steve) — no Vercel PayPal required

1. Ensure `RITMOKIT_FIELD_ENCRYPTION_KEY` is set on Vercel (platform).
2. Manager → Integrations → enter **sandbox** PayPal credentials + website origins.
3. Test connection → status `TESTING`.
4. Run `docs/SANDBOX_UAT_SCRIPT.md`.
5. Switch mode to **live**, paste live credentials, test → `CONNECTED`.
6. Optional: remove legacy `PAYPAL_*` from Vercel once hub is proven.

Env PayPal remains valid as a **migration bridge** so existing Preview deploys do not break mid-cutover.

---

## 6. Security

| Rule | Detail |
|------|--------|
| Encryption | Same AES-256-GCM as HR bank fields (`encryptField`) |
| Production key | `RITMOKIT_FIELD_ENCRYPTION_KEY` required (64 hex or 32-byte base64) |
| UI | Never echo client secret after save; rotate = paste new secret |
| Access | `canAccessManagerSettings` only |
| Webhooks | Signature verify with org webhook id; reject if no match |

---

## 7. Future (not blocking Phase A)

- PayPal OAuth onboarding (no paste client secret)
- Stripe Connect / Square per org
- Per-org Resend / custom From domain (platform Resend stays default)
- Location-scoped overrides (`locationId` column already optional)
- Super-admin “import env → hub” one-shot for ops

---

## 8. Code map

| Piece | Path |
|-------|------|
| Spec (this file) | `docs/INTEGRATION_HUB_SPEC.md` |
| Schema | `OrganizationIntegration` in `prisma/schema.prisma` |
| Resolver | `src/lib/integrations/resolver.ts` |
| PayPal credentials API | `src/lib/payments/paypal.ts` (cred-aware) |
| Checkout | `src/lib/public-api/payments.ts` |
| CORS | `src/lib/public-api/cors.ts` |
| Admin data/actions | `src/lib/data/integrations.ts`, `src/lib/actions/integrations.ts` |
| UI | `src/app/[lang]/(dashboard)/settings/manager/integrations/` |

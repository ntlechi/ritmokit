# KORE Memory — RitmoKit

> Living ops brief. Update after each successful session.

**Last updated:** 2026-08-05  
**Brand id:** `ritmokit` · **Project id:** `ritmokit`  
**First pilot:** Salsa Attitude (Québec)

---

## North star

RitmoKit is **dance-studio ops SaaS** (schedule, lead/follow parity, Accueil tablet, public booking API, PayPal/Interac, room rentals) forked from Mirok HR infrastructure. Pilot green = live PayPal + Resend UAT + Salsa Attitude env pointing at the Salsa tenant.

**UI DNA:** Modernist Organic / Apple–Claude Era — zinc neutrals, frosted glass, monospace metrics. Tokens in `src/app/globals.css` + `src/lib/design/`.

---

## Definition of done (Phase A pilot)

- Public Pay: live PayPal + webhook proven on Vercel (`docs/SANDBOX_UAT_SCRIPT.md`)
- Accueil tablet: FRONT_DESK 1-tap check-in (code GREEN)
- Waitlist promote: Resend delivers pay-link email
- Yield cockpit: Σ paid `amountCad` matches captures (code GREEN)
- See `docs/PHASE_A_DOD_GATE.md`

---

## Human gates

- ❌ Ship PayPal without Integration Hub credentials (or verified env fallback) + webhook
- ❌ Point Salsa site at `bati`/`quebec` slugs for the Salsa pilot
- ❌ Force-push main / skip migrate on production
- ✅ Accueil, public enroll + checkout, Interac queue, room rentals APIs

---

## Key paths & URLs

| What | Where |
|------|--------|
| Phase A DoD | `docs/PHASE_A_DOD_GATE.md` |
| Project brief | `docs/RITMOKIT_PROJECT_BRIEF.md` |
| Public schedule / enroll | `src/lib/public-api/` |
| PayPal | `src/lib/payments/paypal.ts` |
| Booking return URLs | `src/lib/public-api/booking-return.ts` |
| Accueil | `src/app/[lang]/(dashboard)/accueil/` |
| Salsa frontend (sibling) | `C:\Users\Ntlechi\Salsa Attitude` |

---

## Env notes (pilot)

- `RITMOKIT_FIELD_ENCRYPTION_KEY` — Integration Hub
- `RITMOKIT_PUBLIC_ORIGINS` — Salsa Attitude origins
- `RITMOKIT_PUBLIC_BOOKING_RETURN_BASE` — tenant site for PayPal return (`/?booking=confirmation`)
- `RITMOKIT_STUDIO_ROSTER_SECRET` — Bearer for Salsa `/api/ritmokit-roster` proxy (Inscrits)
- `RESEND_API_KEY` + `EMAIL_FROM` — waitlist promote emails
- Hub PayPal CONNECTED for Salsa org (prefer over legacy `PAYPAL_*`)

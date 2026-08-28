# KORE Memory — RitmoKit

> Living ops brief. Update after each successful session.

**Last updated:** 2026-08-28 (OS loop: CRM + owner pulse + class plans)  
**Brand id:** `ritmokit` · **Project id:** `ritmokit`  
**First pilot:** Salsa Attitude (Québec)

---

## North star

RitmoKit is **dance-studio ops SaaS** (schedule, lead/follow parity, Accueil tablet, public booking API, PayPal/Interac, room rentals) forked from Mirok HR infrastructure.

**Field status (2026-08-28, founder report):** Salsa Attitude public site (salsaquebec.com) is live on RitmoKit. PayPal checkout, Resend confirmation, and class inscription are working. Steve is getting full enrollment detail from the loop — this is the proven value wedge.

**Owner OS (2026-08-28):** Students CRM (`/students`) from live enrollments + notes. Cockpit owner pulse (collected / pending Interac / unpaid / rentals / student count). Course plans (`/plans`) week-by-week, shown on Accueil as tonight’s teach card. Requires migration `20260828140000_student_crm_course_lessons`.

**Progression engine (2026-08-28):** `StudentProgression` + `ClassAttendance` (weekly 9/10, not a single overwrite). Accueil week 8+ 1-tap Ready / Review. CRM filters Prêts / À relancer. Profile journey + Resend invite to next level (`/horaire`). Not yet: auto seat hold / Lead-Follow pre-reserve. Migration `20260828150000_student_progression`.

**UI DNA:** Modernist Organic / Apple–Claude Era — zinc neutrals, frosted glass, monospace metrics. Tokens in `src/app/globals.css` + `src/lib/design/`.

---

## Definition of done (Phase A pilot)

- Public Pay: **GREEN in the field** — Salsa site → PayPal → paid enrollment (2026-08-28)
- Resend: **GREEN in the field** — inscription confirmations delivering
- Inscription / Inscrits roster: **Steve-valued** — source of truth for who signed up
- Accueil tablet: code GREEN — not yet confirmed as the Tuesday-night door tool
- Waitlist promote: code ready + Resend live — not yet confirmed as a Steve habit
- Yield cockpit: code GREEN — not yet Steve-trusted vs PayPal totals
- See `docs/PHASE_A_DOD_GATE.md` (doc still dated 2026-07-29; field > doc)

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

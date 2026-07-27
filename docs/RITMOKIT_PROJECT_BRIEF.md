# RitmoKit — Project Brief for New Agents

**Product:** RitmoKit (RitmoKit Studio)  
**Domain:** [ritmokit.com](https://ritmokit.com) — register and use as primary brand domain  
**Tagline (FR):** Le kit d'opérations pour écoles de danse.  
**Tagline (EN):** The complete operating toolkit for dance studios.  
**Tagline (ES):** El kit operativo completo para escuelas de danza.

**Status:** Greenfield product fork — not yet started as a separate repo.  
**Last updated:** July 2026

---

## 1. Executive Summary

**RitmoKit** is a B2B SaaS platform that simplifies and automates the administrative work of dance studios: staff, instructors, students, class scheduling, lead/follow parity, multi-room management, payroll, and public website integration.

**Critical instruction for agents:** Do **not** build RitmoKit from scratch. **Fork and adapt the existing Mirok codebase** (`C:\Users\Ntlechi\Mirok`). Mirok is a production-grade Quebec HR + workforce scheduling SaaS (Next.js 16, Supabase, Prisma, trilingual i18n, agent bus, help center). RitmoKit reuses ~60% of that infrastructure and adds a **dance-studio domain layer** on top.

**First pilot client:** Salsa Attitude (Québec) — public website at `C:\Users\Ntlechi\Salsa Attitude`. The site already has booking UX, session lifecycle, lead/follow parity, and 5-room rental logic (currently `localStorage`). RitmoKit becomes the backend; Salsa Attitude becomes the headless public frontend.

**Optional future upsell:** Kompul (`C:\Users\Ntlechi\financial-dashboard`) — owner CFO layer (TPS/TVQ, recital P&L, comptable export). Integrate via events; do **not** merge codebases.

---

## 2. Vision

| Goal | Description |
|------|-------------|
| **Simplify admin** | One platform for schedules, enrollments, staff, rooms, payroll — replace spreadsheets and disconnected tools |
| **Automate operations** | Session publish, parity enforcement, room conflict detection, proactive alerts |
| **Website integration** | Studio marketing site reads/writes RitmoKit via public API — single source of truth |
| **AI support** | In-app assistant + help center to scale support without a large team |
| **Global-ready, local-first** | Trilingual FR / EN / ES from day one; launch in Quebec, expand to LATAM and global dance hubs |

---

## 3. Source Codebase — Mirok

**Path:** `C:\Users\Ntlechi\Mirok`

### What Mirok already provides (reuse as-is or adapt)

| Area | Location / notes |
|------|------------------|
| Framework | Next.js 16 App Router, React 19, TypeScript, Tailwind v4 |
| Database | Supabase PostgreSQL + Prisma ORM (~70 models) |
| Auth & roles | Supabase Auth — `EMPLOYEE`, `MANAGER`, `OWNER`, `ADMIN` |
| Multi-tenant | `Organization` → `Location` → `Station` hierarchy |
| HR | Onboarding, time-off, reviews, skills matrix, discipline, benefits |
| Scheduling | Shift calendar, templates, auto-schedule, availability |
| Payroll export | Nethris/Payworks CSV — `src/lib/actions/payroll.ts` |
| i18n | `app/[lang]/` — **FR (default) / EN / ES** — keep and extend |
| Help center | `src/lib/help/`, `src/components/help/help-center.tsx` |
| Chat / messaging | Team channels, DMs |
| Agent bus | Event-driven AI handlers — `src/lib/agents/` |
| Public API pattern | e.g. `POST /api/careers/apply` — replicate for studio public routes |
| Provisioning | `npm run provision:franchise` — adapt for new studios |
| Deployment | Vercel, region `yul1` (Montreal) |

### What to strip or make optional (restaurant/QSR-specific)

- POS integration, tips pool, food cost, MAPAQ food safety
- SPLH staffing curves (restaurant labor KPIs)
- CNESST shift rules where they conflict with **class-based** scheduling (keep HR payroll compliance)
- Arsimatrix Bati Cantine recruitment branding
- Code Red emergency kitchen replacement (low priority for dance)

### What to build new (dance-specific)

- Students, families, enrollments, waitlists
- Sessions / seasons (draft → active → archived lifecycle)
- Classes with **Lead / Follow parity**
- Course catalog (style, level, package pricing)
- Room rental booking (port logic from Salsa Attitude `src/rentals/`)
- Public schedule + enrollment API for external websites
- PayPal / Stripe payment confirmation webhooks
- Dance analytics (retention L1→L2, churn, revenue per class, $/m²)
- RitmoKit AI support layer (see Section 8)

---

## 4. Reference Codebase — Salsa Attitude (Pilot Website)

**Path:** `C:\Users\Ntlechi\Salsa Attitude`

| Module | Files | RitmoKit integration |
|--------|-------|----------------------|
| Session lifecycle | `src/sessions.js` | Replace `localStorage` → RitmoKit API |
| Class + parity model | `src/sessionData.js` | Map to Prisma models |
| Public booking UX | `src/BookingModal.jsx`, `src/SessionScheduler.jsx` | Keep UI; POST enrollments to RitmoKit |
| Schedule admin grid | `src/ScheduleGridEditor.jsx` | Port patterns or embed RitmoKit admin |
| 5-room rentals | `src/rentals/*` | Port conflict engine + config |
| Special / social events | `src/specialEvents.js`, `src/socialEvents.js` | RitmoKit events module |
| Seed data | `data/horaires.json` | Import script for first tenant |
| Payments | Simulated today | **PayPal** (studio preference) at launch |

**Integration architecture:**

```
Salsa Attitude (Vite/React public site)
        │  HTTPS + CORS
        ▼
RitmoKit Public API  (/api/public/*)
        │
        ▼
RitmoKit Dashboard   (app.ritmokit.com — forked Mirok admin)
        │
        ▼
Supabase PostgreSQL
```

---

## 5. Cartographie de transition : Mirok → RitmoKit

> Source stratégique — conserver comme référence métier.

Mirok fournit le cœur RH et planification ; RitmoKit y ajoute la couche événementielle, commerciale et analytique propre aux écoles de danse.

| Module Mirok (Base RH/Planning) | Extension RitmoKit (Danse & Studios) |
|---------------------------------|--------------------------------------|
| Employees / Staff | **Instructors** (statut, spécialités, taux horaire/forfait/commission) |
| Shifts / Plages horaires | **Sessions / Classes** (associées à une salle, discipline, niveau) |
| Locations / Branches | **Studios & Rooms** (matrice multi-salles, superficie m²) |
| Time Off & Disponibilités | **Remplacements & disponibilités des profs** |
| Payroll Calculator | **Paie mixte + rentabilité par cours** |
| *(nouveau)* | **Enrollments** (équilibre Cavaliers / Cavalières) |
| *(nouveau)* | **Analytics & heatmap** (rétention N1→N2, churn) |
| *(nouveau)* | **Public API** (site web, PayPal, QR check-in) |
| *(nouveau)* | **AI Support** (assistant + help center) |

---

## 6. Database Schema (Target — Prisma / PostgreSQL)

Derived from Mirok patterns and adapted for dance studios. **Extend** Mirok's existing `Organization` / `Location` models rather than replacing them blindly — map `Location` → Studio branch, `Station` → Room where sensible.

```prisma
// ==========================================
// 1. ORGANISATION ET ESPACES (Multi-Studios)
// ==========================================

model Studio {
  id        String   @id @default(uuid())
  name      String   // ex: "Salsa Attitude - Main Branch"
  slug      String   @unique
  address   String?
  rooms     Room[]
  createdAt DateTime @default(now())
}

model Room {
  id          String    @id @default(uuid())
  studioId    String
  studio      Studio    @relation(fields: [studioId], references: [id])
  name        String    // ex: "Studio A", "Salle Salsa"
  capacity    Int
  surfaceSqm  Float?    // Analytics rendement $/m²
  sessions    Session[]
}

// ==========================================
// 2. UTILISATEURS ET RH (Héritage Mirok)
// ==========================================

enum UserRole {
  ADMIN
  INSTRUCTOR
  STUDENT
  FRONT_DESK   // optional — reception role
}

enum PayType {
  HOURLY           // $/h
  FLAT_PER_CLASS   // $/cours
  COMMISSION       // $/élève présent
}

model User {
  id            String       @id @default(uuid())
  email         String       @unique
  firstName     String
  lastName      String
  phone         String?
  role          UserRole     @default(STUDENT)
  locale        String       @default("fr") // fr | en | es

  // Profil instructeur
  payType       PayType?
  payRate       Decimal?
  bio           String?
  specialties   String[]     // ["Salsa", "Bachata"]

  taughtSessions Session[]   @relation("PrimaryInstructor")
  enrollments    Enrollment[]
  payrolls       PayrollLog[]
}

// ==========================================
// 3. COURS, SESSIONS ET PARITÉ (Ritmo Core)
// ==========================================

enum DanceRole {
  LEAD     // Cavalier
  FOLLOW   // Cavalière
  SOLO
}

enum CourseLevel {
  BEGINNER
  INTERMEDIATE
  ADVANCED
}

enum SessionSeasonStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model SessionSeason {
  id           String              @id @default(uuid())
  name         String              // ex: "Session Été 2026"
  status       SessionSeasonStatus @default(DRAFT)
  bookingOpen  Boolean             @default(false)
  publishOn    DateTime?
  startsOn     DateTime
  endsOn       DateTime
  classes      Session[]
}

model Course {
  id          String      @id @default(uuid())
  title       String
  level       CourseLevel
  style       String
  sessions    Session[]
}

model Session {
  id              String       @id @default(uuid())
  seasonId        String?
  season          SessionSeason? @relation(fields: [seasonId], references: [id])
  courseId        String
  course          Course       @relation(fields: [courseId], references: [id])
  roomId          String
  room            Room         @relation(fields: [roomId], references: [id])
  instructorId    String
  instructor      User         @relation("PrimaryInstructor", fields: [instructorId], references: [id])

  dayOfWeek       Int?         // 0=Sun … 6=Sat (recurring grid)
  startTime       DateTime
  endTime         DateTime
  maxLeads        Int
  maxFollows      Int
  priceRegular    Decimal
  priceCouple     Decimal?
  priceStudent    Decimal?

  enrollments     Enrollment[]
}

model Enrollment {
  id          String    @id @default(uuid())
  sessionId   String
  session     Session   @relation(fields: [sessionId], references: [id])
  studentId   String
  student     User      @relation(fields: [studentId], references: [id])
  danceRole   DanceRole
  paid        Boolean   @default(false)
  paymentRef  String?   // PayPal / Stripe transaction id
  attended    Boolean   @default(false)
  createdAt   DateTime  @default(now())

  @@unique([sessionId, studentId])
}

// ==========================================
// 4. MODULE FINANCIER & ANALYTICS
// ==========================================

model PayrollLog {
  id           String   @id @default(uuid())
  instructorId String
  instructor   User     @relation(fields: [instructorId], references: [id])
  periodStart  DateTime
  periodEnd    DateTime
  totalClasses Int
  totalHours   Float
  grossPay     Decimal
  status       String   // DRAFT | APPROVED | PAID
  createdAt    DateTime @default(now())
}
```

> **Note for agents:** Merge thoughtfully with Mirok's existing `prisma/schema.prisma` (~2200 lines). Prefer extending `Organization`/`Location`/`User` over duplicate models.

---

## 7. Business Logic Engines

### A. Lead/Follow Parity Engine

When a student enrolls in a partner dance class (Salsa, Bachata, etc.):

1. Check current `leads.filled` vs `follows.filled` against `maxLeads` / `maxFollows`
2. Enforce max imbalance (e.g. +2 leads vs follows) — block role if quota exceeded
3. Auto-waitlist by role: *"Liste d'attente Cavalières — 1 Cavalier requis pour débloquer"*
4. Package courses: same course name across multiple weekdays = one payment (port from Salsa `getPackagePeers()`)

**Reference implementation (UI prototype):** `C:\Users\Ntlechi\Salsa Attitude\src\sessionData.js`, `BookingModal.jsx`

### B. Payroll & Class Profitability Engine

For each completed class:

```
Revenue = paid_enrollments × price_per_student

Instructor cost =
  HOURLY      → hours × hourly_rate
  FLAT        → flat_per_class
  COMMISSION  → attendees × commission_rate

Gross margin = Revenue − Instructor cost
Room yield ($/m²) = Gross margin ÷ room.surfaceSqm
```

Extend Mirok payroll export (`src/lib/actions/payroll.ts`) — do not duplicate.

### C. Room Conflict Engine

Classes block room rentals; buffer between bookings. Port from Salsa `src/rentals/rentalSchedule.js`.

### D. Session Season Lifecycle

```
DRAFT → (publishOn date) → ACTIVE → ARCHIVED
```

Port from Salsa `src/sessions.js`.

---

## 8. AI Support System

**Goal:** Handle 70–80% of tier-1 support at scale without a large human team.

### Architecture (build in phases)

| Phase | Scope |
|-------|-------|
| **1** | Port Mirok help center — searchable FAQ, role-based articles, changelog |
| **2** | In-app `?` widget — RAG bot answers from docs only |
| **3** | Context-aware assistant — reads tenant state (session published?, parity imbalance?, PayPal error?) |
| **4** | Proactive alerts + ticket escalation to human support |
| **5** | Optional Kompul-style guardrails — suggest actions, user confirms before writes |

### Reuse from Mirok

- `src/lib/help/config.ts`, `search.ts`
- `src/components/help/help-center.tsx`
- `src/lib/agents/bus.ts` — proactive event handlers

### Reuse patterns from Kompul (guardrails only)

- User-confirmed writes (no silent mutations)
- Educational disclaimers for tax/legal questions
- Path: `C:\Users\Ntlechi\financial-dashboard` (Komy AI patterns)

### Escalation flow

```
AI assistant (max 3 turns)
    → Help article
    → "Still stuck?" → Support ticket (auto-attach: tenantId, role, screen, logs)
    → Human support
    → Engineering (bugs/outages)
```

### Languages

Support AI must respond in **FR, EN, or ES** matching user locale.

---

## 9. Trilingual Strategy (FR / EN / ES)

**Decision: Yes — trilingual from day one in code. Market locally first.**

| Language | Primary markets | Strategic role |
|----------|-----------------|----------------|
| **French (FR)** | Quebec, France, Belgium, West Africa | Launch pad — Salsa Attitude pilot |
| **English (EN)** | Canada, US, UK, Australia | Global SaaS scale |
| **Spanish (ES)** | LATAM, Spain, US Hispanic | Salsa/Bachata cultural core |

### Implementation (already in Mirok — extend, don't rebuild)

```
src/lib/i18n/          # Mirok dictionaries
app/[lang]/            # Locale routing — FR default for Quebec tenants
/locales/
  ├── fr.json
  ├── en.json
  └── es.json
```

**Rules for agents:**

- **Never hardcode UI strings** in components — use i18n keys
- Add dance-specific terminology to all three locales simultaneously

| Concept | FR | EN | ES |
|---------|----|----|-----|
| Lead / Follow | Cavalier / Cavalière | Lead / Follow | Leader / Follower (Guía / Seguidor) |
| Parity | Parité Hommes/Femmes | Lead/Follow Balance | Balance de Parejas |
| Instructor payroll | Paie des instructeurs | Instructor Payroll | Nómina de profesores |
| Drop-in class | Cours à l'unité | Drop-in Class | Clase suelta |
| Session season | Session (trimestre) | Session / Term | Temporada |
| Trial class | Cours d'essai | Trial Class | Clase de prueba |

### Roadmap

```
Phase 1 — Local proof (FR + EN)
├── Pilot: Salsa Attitude (Québec)
├── Validate ops, payroll, parity, website API
└── i18n hooks active; ES strings stubbed

Phase 2 — LATAM (ES enabled)
├── Spanish UI toggle live
├── Partner studios (Colombia, DR, Mexico)
└── Regional pricing / Mercado Pago (future)
```

---

## 10. Public API (Website Integration)

Create under `src/app/api/public/` following Mirok's `careers/apply` pattern (Zod validation, tenant scoping, optional HMAC secret).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/public/schedule` | Active session classes for public site |
| GET | `/api/public/sessions` | Current + upcoming seasons |
| GET | `/api/public/classes/:id/availability` | Lead/follow seats |
| POST | `/api/public/enrollments` | Guest checkout → PayPal redirect |
| POST | `/api/public/webhooks/paypal` | Payment confirmation |
| GET | `/api/public/events` | Social nights, congress, special events |
| POST | `/api/public/room-rentals` | 5-room booking requests |
| GET | `/api/public/announcements` | Studio announcements |

**CORS:** Allow Salsa Attitude production domain + preview URLs via env `RITMOKIT_PUBLIC_ORIGINS`.

---

## 11. Payments

| Context | Provider | Notes |
|---------|----------|-------|
| **Salsa Attitude pilot** | PayPal | Studio already uses PayPal — money goes to studio account |
| **RitmoKit SaaS billing** | Stripe Billing | Studio pays RitmoKit subscription |
| **Future global** | Stripe + Mercado Pago | LATAM expansion |

Implement payment provider abstraction — do not hardcode PayPal globally.

---

## 12. Kompul Integration (Future Upsell — Optional)

**Path:** `C:\Users\Ntlechi\financial-dashboard`

Do **not** rebuild Kompul financials inside RitmoKit. Integrate via events:

```
RitmoKit → POST /api/integrations/v1/ingest
  events: sale.ticket_closed, labor.shift, finance.expense_import
Kompul → Owner CFO dashboard (TPS/TVQ, recital P&L, comptable export)
```

**Product split:**

| Layer | Product |
|-------|---------|
| Studio operations | RitmoKit |
| Owner CFO / tax clarity | Kompul (upsell) |
| Public marketing site | Client website (e.g. Salsa Attitude) |

---

## 13. Branding & Domains

| Asset | URL |
|-------|-----|
| Marketing site | `ritmokit.com` |
| App dashboard | `app.ritmokit.com` |
| API | `api.ritmokit.com` or same origin `/api` |
| Docs | `docs.ritmokit.com` |

**Brand name:** RitmoKit (or RitmoKit Studio for vertical clarity)  
**Do not use:** bare "Ritmo" as legal product name — RitmoKit is more distinct and `.com` is available.

---

## 14. Roles & Permissions (Target)

| Role | Access |
|------|--------|
| **OWNER** | Full studio config, billing, payroll approve, all locations |
| **ADMIN** | Sessions, enrollments, staff, rooms, reports |
| **FRONT_DESK** | Check-in, enrollments, view schedules |
| **INSTRUCTOR** | Own schedule, attendance, limited student view |
| **STUDENT** | Own enrollments, payments (portal — Phase 2) |

Map from Mirok's `EMPLOYEE` / `MANAGER` / `OWNER` / `ADMIN` — extend, don't restart auth.

---

## 15. Development Roadmap

### Phase 0 — Fork & rebrand (Week 1–2)

- [ ] Fork `C:\Users\Ntlechi\Mirok` → new repo `ritmokit` (or branch `ritmokit`)
- [ ] Rebrand package, env vars, help center copy
- [ ] Strip QSR modules (POS, tips, food cost, MAPAQ)
- [ ] Register `ritmokit.com`, configure Vercel project

### Phase 1 — Dance domain models (Week 3–6)

- [ ] Prisma models: SessionSeason, Course, Session, Enrollment, Room extensions
- [ ] Lead/follow parity engine + waitlists
- [ ] Port Salsa `horaires.json` import script
- [ ] Session lifecycle (draft → active → archived)

### Phase 2 — Public API + Salsa integration (Week 7–10)

- [ ] Public API routes (schedule, enrollments, availability)
- [ ] PayPal checkout + webhook
- [ ] Rewire Salsa Attitude from `localStorage` → RitmoKit API
- [ ] Room rental module in RitmoKit backend

### Phase 3 — Admin UI (Week 8–12, parallel)

- [ ] Studio dashboard: 5-room matrix, live parity, occupancy
- [ ] Schedule grid editor (port Salsa `ScheduleGridEditor` patterns)
- [ ] Instructor HR views (reuse Mirok team module)

### Phase 4 — Support & polish (Week 12–16)

- [ ] Help center content (dance-specific FAQ)
- [ ] AI support widget (RAG → contextual)
- [ ] Proactive alerts (unpublished session, parity imbalance, payment failures)
- [ ] ES locale completion

### Phase 5 — Scale (Post-pilot)

- [ ] Multi-studio provisioning script
- [ ] Kompul ingest integration
- [ ] Student portal
- [ ] LATAM pricing tiers

---

## 16. Pilot Client — Salsa Attitude

| Item | Detail |
|------|--------|
| Location | 3188 chemin Ste-Foy, Québec |
| Rooms | 5 (Studio A, B, SS-1, SS-2, SS-3) |
| Styles | Salsa, Bachata, Kizomba, etc. |
| Website repo | `C:\Users\Ntlechi\Salsa Attitude` |
| Pricing (founder deal) | ~$3,000 + tx site build; ~$49/mo + tx RitmoKit |
| Role | **Client fondateur #1** — shapes product with real data |

---

## 17. Agent Onboarding Checklist

When starting work on RitmoKit, read in this order:

1. **This file** — `C:\Users\Ntlechi\Mirok\docs\RITMOKIT_PROJECT_BRIEF.md`
2. **Mirok README** — `C:\Users\Ntlechi\Mirok\README.md`
3. **Mirok schema** — `C:\Users\Ntlechi\Mirok\prisma\schema.prisma`
4. **Mirok i18n** — `C:\Users\Ntlechi\Mirok\src\lib\i18n\`
5. **Mirok help center** — `C:\Users\Ntlechi\Mirok\src\lib\help\`
6. **Salsa session model** — `C:\Users\Ntlechi\Salsa Attitude\src\sessions.js`, `sessionData.js`
7. **Salsa rentals** — `C:\Users\Ntlechi\Salsa Attitude\src\rentals\ARCHITECTURE.md`
8. **Salsa booking UX** — `BookingModal.jsx`, `SessionScheduler.jsx`

### Commands (Mirok dev setup)

```bash
cd C:\Users\Ntlechi\Mirok
npm install
cp .env.example .env
# Configure Supabase + DATABASE_URL — see docs/PROVISIONING.md
npx prisma migrate dev
npm run dev
```

### Key constraints for all agents

- **Fork Mirok** — do not greenfield a new stack
- **i18n from day one** — FR / EN / ES keys for every new string
- **User-confirmed writes** for AI — never silent mutations
- **Public API** for website — never expose service role to Salsa frontend
- **PayPal for Salsa pilot** — abstract payment provider
- **Quebec-first** — timezone `America/Toronto`, fr-CA copy default for pilot tenant

---

## 18. Success Metrics (Pilot)

| Metric | Target |
|--------|--------|
| Salsa site live on RitmoKit API | Schedule + booking without localStorage |
| Parity engine | Zero manual overbooking of lead/follow slots |
| Admin time saved | Publish session in < 5 min (vs manual) |
| Support | 80% questions answerable via help center + AI |
| Uptime | 99.5% on public schedule API |

---

## 19. Related Repositories

| Repo | Path | Role |
|------|------|------|
| **Mirok** (source) | `C:\Users\Ntlechi\Mirok` | Fork base — HR, scheduling, auth, i18n, agents |
| **Salsa Attitude** | `C:\Users\Ntlechi\Salsa Attitude` | Pilot public website + booking UX |
| **Kompul** | `C:\Users\Ntlechi\financial-dashboard` | Optional CFO upsell — integrate via ingest API |

---

## 20. Open Questions (resolve during Phase 0)

- [ ] Separate Git repo `ritmokit` vs branch in Mirok monorepo?
- [ ] SSO between Salsa admin and RitmoKit dashboard — Phase 1 or 2?
- [ ] Stripe vs PayPal as RitmoKit platform billing default?
- [ ] Embed RitmoKit schedule admin in Salsa `StudioAdmin.jsx` or redirect to `app.ritmokit.com`?

---

*Document prepared for handoff to a new Cursor agent or development team. Update this file as decisions are made.*

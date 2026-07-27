# KORE Memory — Mirok

> Living ops brief. Update after each successful session.

**Last updated:** 2026-07-20
**Brand id:** `mirok` · **Project id:** `mirok`
**First franchise:** Bati Québec — target cutover Oct 2026

---

## North star

Mirok is **Quebec HR & scheduling SaaS** with CNESST compliance baked into Postgres triggers and an **agentic event bus** (late arrival, crisis replacement, chat intents) — PWA for floor staff.

**UI DNA:** Modernist Organic / Apple–Claude Era (Fable) — zinc neutrals, floating capsules, station matrix tints, frosted glass, monospace metrics. Tokens in `src/app/globals.css` + `src/lib/design/`.

---

## Definition of done

- CNESST triggers enforced in SQL (weekly hours, 30min break after 5h, 32h rest)
- `npm run lint` passes
- Migrations 0001–0005 applied on target Supabase project
- Agent webhook `/api/agents/webhook` receives `pg_notify` events

---

## Human gates

- ❌ Relax CNESST rules in application code to "fix" scheduling conflicts
- ❌ Run k6 load tests against production
- ❌ Shift mutations without session auth (TODO in `shifts.ts` — enforce before prod)
- ✅ Calendar UI, agent handlers, franchise provisioning on staging

---

## Key paths & URLs

| What | Where |
|------|--------|
| Setup | `README.md` |
| Staging → prod | `docs/PROVISIONING.md` |
| CNESST + agent bus SQL | `supabase/migrations/0001*.sql` … `0005*.sql` |
| Prisma schema | `prisma/schema.prisma` |
| Agent handlers | `src/lib/agents/` |
| Franchise seed | `scripts/provision-franchise.ts` |
| Load tests (staging) | `tests/load/` |

---

## Current sprint — top 3

1. **Bati cutover prep** — staging mirror checklist in `docs/PROVISIONING.md`
2. **Auth on shift actions** — resolve Supabase session in `src/lib/actions/shifts.ts`
3. **Agent expansion** — chat intent router beyond `late_arrival` `(verify)`

---

## Anti-patterns

- CNESST logic duplicated in TS instead of honoring SQL triggers
- Provisioning prod without PITR + migration review
- Treating Mirok as Kompul financial dashboard

---

## Validate

```bash
npm run lint
```

---

## Session log

| Date | Shipped |
|------|---------|
| 2026-07-15 | Nexus onboarding — KORE + projects.json registered |

**Next session:** Audit `shifts.ts` auth seam + staging webhook config for agent bus.

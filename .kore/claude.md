# KORE Phare — Mirok

> Loaded by Nexus when `projectId: mirok`. Pair with `.kore/memory.md`.

## Craftsmanship

- Next.js 16 App Router + Prisma 7 + Supabase — match `AGENTS.md` / `README.md`
- TypeScript strict; Tailwind v4; Apple/Linear aesthetic
- User strings: FR (default) + EN + ES via `app/[lang]/`
- Never relax CNESST rules via app flags — logic lives in SQL triggers

## Brand voice

- Operational B2B for Quebec restaurant/franchise **gérants** and staff
- Compliance-forward (CNESST), calm and practical — not flashy consumer marketing
- FR-first trilingual

## Repo conventions

- Default branch: `master`
- Quality gate: **off** (lint only: `npm run lint`)
- Region: Supabase `ca-central-1`, Vercel `yul1`
- Provisioning: `docs/PROVISIONING.md`, `npm run provision:franchise`

## Out of scope

- Disabling or bypassing CNESST triggers in SQL
- Load tests against prod (`npm run test:load` staging only, `ALLOW_LOAD_TEST=1`)
- Kompul/Survive/ARSI feature creep

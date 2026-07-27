# RitmoKit

**Le kit d'opérations pour écoles de danse.**  
The complete operating toolkit for dance studios.  
El kit operativo completo para escuelas de danza.

B2B SaaS for dance studios: instructors, students, class scheduling, lead/follow parity, multi-room management, payroll, and public website integration — built for the agentic era.

Forked from the Mirok HR + scheduling engine; dance domain layered on top.

## Stack

| Layer | Choice |
| ----- | ------ |
| Framework | Next.js 16 (App Router, Turbopack, React 19, React Compiler) |
| Language | TypeScript strict |
| Style | Tailwind CSS v4 |
| PWA | Serwist |
| Database | Supabase PostgreSQL + Prisma ORM 7 |
| Auth & Realtime | Supabase Auth + Realtime |
| Agent bus | Postgres triggers (`pg_notify`) + Database Webhooks |
| i18n | `app/[lang]/` — FR (default) / EN / ES |
| Deploy | Vercel region `yul1` (Montreal); Supabase `ca-central-1` |

## Domains

| Surface | URL |
| ------- | --- |
| Marketing | [ritmokit.com](https://ritmokit.com) |
| App | `app.ritmokit.com` |
| Docs | `docs.ritmokit.com` |

## Getting started

```bash
npm install
cp .env.example .env
# Configure Supabase + DATABASE_URL — see docs/PROVISIONING.md
npx prisma migrate dev
npm run dev
```

Pilot client: **Salsa Attitude** (Québec). Product brief: [`docs/RITMOKIT_PROJECT_BRIEF.md`](./docs/RITMOKIT_PROJECT_BRIEF.md).

## Agent bus

Business events enqueue tasks on `agent_logs`. Dance channels include:

- `session.season_published`
- `enrollment.parity_alert`
- `instructor.payroll_calculated`
- `churn.risk_detected`

AI mutations stay **user-confirmed** — agents suggest; humans approve writes.

## Provisioning

```bash
npm run provision:franchise
```

Adapt for new studios (script retained from Mirok; studio-oriented copy).

## License

Private — all rights reserved.

# Runbook — Provisionnement Production & Staging (Vague 1)

Cible : ouverture **Bati Québec — octobre 2026**.  
Principe : **Staging miroir → Production**. Jamais de charge ni de `migrate` expérimental directement en prod.

```
[ Local Dev ] ──> [ Staging Miroir ] ──> [ Production Bati ]
     │                    │                      │
  .env local        Supabase staging        Supabase Pro + PITR
  migrate dev       pooler 6543             pooler 6543
                    migrate deploy          migrate deploy
                    Vercel Preview          Vercel Production
```

---

## 0. Guardrails non négociables

| Règle | Détail |
|-------|--------|
| **Pas de `prisma db push`** sur staging/prod | Schéma uniquement via `prisma migrate deploy` |
| **Deux URLs DB** | `DATABASE_URL` = pooler **6543** (runtime) · `DIRECT_DATABASE_URL` = **5432** (DDL) |
| **Secrets isolés** | Staging ≠ Production (projets Supabase distincts, `AGENT_WEBHOOK_SECRET` distinct) |
| **CNESST / paie** | Aucun assouplissement via provisionnement ou RSI |
| **Région** | Supabase `ca-central-1` · Vercel `yul1` (voir `vercel.json`) |

---

## 1. Créer les projets Supabase (Staging puis Prod)

Pour **chaque** environnement :

1. Nouveau projet Supabase — région **Canada (Central)** `ca-central-1`.
2. Activer **PITR** sur Production (Supabase Pro).
3. Copier dans Vercel (ou `.env`) les valeurs de [`.env.production.template`](../.env.production.template) :
   - `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (Transaction pooler, `?pgbouncer=true&connection_limit=20`)
   - `DIRECT_DATABASE_URL` (session / direct, port 5432)
   - `AGENT_WEBHOOK_SECRET` (`openssl rand -hex 32`)
   - `NEXT_PUBLIC_APP_URL` (`https://staging.mirok.ca` ou `https://app.mirok.ca`)
   - `TZ=America/Toronto`

4. Vérifier le pooler : Dashboard → **Database → Connection string** → **Transaction** (6543) vs **Session** (5432).

---

## 2. Pipeline de migration immuable

### Local (dev uniquement)

```bash
npm run prisma:migrate:dev
npm run prisma:seed   # données démo — JAMAIS en prod
```

### Staging / Production (Vercel)

`vercel.json` force :

```text
npm run vercel-build
→ prisma generate && prisma migrate deploy && next build
```

Vérification manuelle avant cutover :

```bash
# Pointer DIRECT_DATABASE_URL + DATABASE_URL vers staging
npm run prisma:migrate:status
npm run prisma:migrate:deploy
```

### SQL métier (CNESST + bus agents)

Après les migrations Prisma, appliquer **dans l’ordre** contre `DIRECT_DATABASE_URL` :

```bash
npx prisma db execute --file supabase/migrations/0001_cnesst_rules_and_agent_bus.sql
npx prisma db execute --file supabase/migrations/0002_agent_webhook_autoconfig.sql
npx prisma db execute --file supabase/migrations/0003_chat_agent_pipeline.sql
npx prisma db execute --file supabase/migrations/0004_auth_profile_sync.sql
npx prisma db execute --file supabase/migrations/0005_chat_auto_join.sql
```

Configurer le webhook agents (si pas via 0002) :

- Table `agent_logs` · event **Insert**
- URL : `https://<domaine>/api/agents/webhook`
- Header : `Authorization: Bearer <AGENT_WEBHOOK_SECRET>`

Ou SQL :

```sql
alter database postgres set app.settings.agent_webhook_url = 'https://app.mirok.ca/api/agents/webhook';
alter database postgres set app.settings.agent_webhook_secret = '<AGENT_WEBHOOK_SECRET>';
```

---

## 3. Vercel — projets & environnements

1. Lier le repo GitHub à Vercel.
2. **Production** : branche `main` → domaine `app.mirok.ca`.
3. **Preview / Staging** : branche `staging` (ou previews) → `staging.mirok.ca`.
4. Injecter les variables du template **par environnement** (Production vs Preview).
5. Confirmer Build Command = `npm run vercel-build` (déjà dans `vercel.json`).
6. Région d’exécution : `yul1` (Montréal).

Smoke post-deploy :

- `GET /fr` répond 200
- Login Supabase Auth OK
- `POST /api/agents/webhook` sans Bearer → 401
- Culture Health charge sans erreur DB

---

## 4. Provisionner la franchise Bati (données, pas schéma)

Prérequis : le compte Owner existe déjà dans Supabase Auth **et** dans `public.users` (trigger 0004).

```bash
# Contre DATABASE_URL = staging (répéter ensuite en prod après validation)
npm run provision:franchise -- \
  --org "Bati Québec" \
  --org-slug bati \
  --location "Bati — Québec Centre" \
  --location-slug quebec-centre \
  --owner-id <uuid-auth-user> \
  --city Québec \
  --lat 46.8139 \
  --lng -71.208
```

Ce script (`src/lib/production/provision-franchise.ts`) injecte de façon transactionnelle :

1. `Organization` + `Location` (timezone Toronto, géofence 150 m)
2. `LocationMember` + rôle `OWNER` sur `User`
3. Constitution culturelle Bati (5 valeurs)
4. Canaux `#annonces` `#cuisine` `#comptoir` `#emballage` `#gestion`
5. Playbooks RSI 2 par défaut (`CRISIS_REPLACEMENT`, `CNESST_GUARD`, `LATE_ARRIVAL`)
6. Expérience RSI 3 `CULTURE_CARD_ABOVE_BUDDY` en **DRAFT**

Idempotent : relancer met à jour sans dupliquer.

---

## 5. Checklist cutover Production (J-14 → J-0)

| Jour | Action |
|------|--------|
| J-14 | Staging vert : migrate + SQL + webhook + provision franchise test |
| J-10 | Charge fin de shift **sur staging uniquement** (Vague 3) |
| J-7 | Créer projet Supabase Prod + PITR + secrets Vercel Production |
| J-5 | `migrate deploy` + SQL 0001–0005 sur Prod |
| J-3 | `provision:franchise` Owner réel Bati |
| J-2 | Webhook agents Prod + smoke pointeuse / Pulse / Culture Health |
| J-0 | DNS `app.mirok.ca` → Vercel Production · freeze migrations non urgentes |

---

## 6. Interdits explicites

- `prisma db push` / `migrate reset` sur staging ou prod
- Réutiliser `AGENT_WEBHOOK_SECRET` entre staging et prod
- Pointer `DIRECT_DATABASE_URL` sur le port 6543
- Exécuter `prisma db seed` en production (données démo)
- Modifier seuils CNESST via playbooks ou feature flags

---

## Suite

Vague 2 (charge fin de shift) : [`tests/load/README.md`](../tests/load/README.md)  
— exécuter **uniquement** contre staging avec `ALLOW_LOAD_TEST=1`.

Vague 3 (monitoring / multi-succursale) s’exécute une fois la checklist verte.

# Mirok

SaaS de gestion RH et d'horaires, conçu pour le Québec (conformité CNESST) et
pour l'ère agentique : chaque événement métier réveille des agents IA en
arrière-plan via un bus d'événements basé sur Supabase.

## Recrutement → Arsimatrix

Candidatures Bati Cantine : `POST /api/careers/apply` → usine Arsimatrix (`bati-recruit`).  
Détails : [`docs/ARSIMATRIX_RECRUIT.md`](./docs/ARSIMATRIX_RECRUIT.md).

## Stack

| Couche          | Choix                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack, React 19.2, React Compiler)         |
| Langage         | TypeScript strict                                                       |
| Style           | Tailwind CSS v4, esthétique Apple/Linear                               |
| PWA             | Serwist (`@serwist/turbopack`) — installable iOS/Android, hors-ligne   |
| Base de données | Supabase (PostgreSQL) + Prisma ORM 7 (client Rust-free, adaptateur `pg`) |
| Auth & Realtime | Supabase Auth + Supabase Realtime (Postgres Changes)                   |
| Bus d'agents    | Triggers Postgres (`pg_notify`) + Database Webhooks Supabase           |
| i18n            | Routing natif `app/[lang]/` — FR (défaut) / EN / ES                    |

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les clés Supabase + DATABASE_URL
```

> **Production / Staging** — voir le runbook complet :
> [`docs/PROVISIONING.md`](./docs/PROVISIONING.md)
> (pooler 6543, `migrate deploy`, webhook agents, `npm run provision:franchise`).

### 1. Créer le projet Supabase

Créez un projet sur [supabase.com](https://supabase.com) (région
`ca-central-1` pour minimiser la latence avec le Québec), puis copiez dans
`.env` : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (Transaction pooler, port 6543 —
utilisé par l'app en runtime) et `DIRECT_DATABASE_URL` (connexion directe,
port 5432 — utilisée uniquement par Prisma pour les migrations DDL).

> Une fois ces valeurs dans `.env`, les étapes 2 et 3 peuvent être exécutées
> directement par l'agent dans ce terminal — donnez-lui le signal et il lance
> les commandes ci-dessous lui-même plutôt que de les copier-coller à la main.

### 2. Créer les tables (Prisma)

```bash
npx prisma migrate dev --name init_mirok_core
npx prisma db seed
```

### 3. Appliquer les règles CNESST + le bus d'agents (SQL)

Le fichier [`supabase/migrations/0001_cnesst_rules_and_agent_bus.sql`](./supabase/migrations/0001_cnesst_rules_and_agent_bus.sql)
ajoute par-dessus les tables Prisma :

- les triggers qui calculent automatiquement les heures hebdomadaires, la
  pause obligatoire (30 min après 5h) et le repos minimal (32h) ;
- la file d'attente `agent_logs` + `pg_notify`, qui réveille les agents dès
  qu'un quart passe à `REJECTED` ou `CRISIS_ALERT` ;
- les policies RLS minimales.

Trois façons équivalentes de l'appliquer — choisissez selon votre préférence :

```bash
# (a) Sans installer la CLI Supabase — via Prisma, contre DIRECT_DATABASE_URL
npx prisma db execute --file supabase/migrations/0001_cnesst_rules_and_agent_bus.sql

# (b) Avec la CLI Supabase (déjà en devDependency), après `supabase link`
npx supabase link --project-ref <votre-ref>
npx supabase db push

# (c) Copier-coller le contenu du fichier dans Database > SQL Editor du dashboard
```

### 4. Configurer le réveil des agents (Database Webhook)

**Option recommandée pour démarrer** — dans Supabase → **Database → Webhooks** :

- Table : `agent_logs`, événement : `Insert`
- URL : `https://<votre-domaine-ou-tunnel-ngrok>/api/agents/webhook`
- Header : `Authorization: Bearer <AGENT_WEBHOOK_SECRET>` (même valeur que
  dans `.env`)

**Option "zéro-ClickOps"** — [`0002_agent_webhook_autoconfig.sql`](./supabase/migrations/0002_agent_webhook_autoconfig.sql)
fait faire le même appel HTTP directement par un trigger SQL (`pg_net`), sans
passer par le dashboard. Les deux mécanismes peuvent coexister sans risque
(idempotence garantie par `claimAgentTask`) :

```sql
alter database postgres set app.settings.agent_webhook_url = 'https://<votre-domaine>/api/agents/webhook';
alter database postgres set app.settings.agent_webhook_secret = '<AGENT_WEBHOOK_SECRET>';
```

puis appliquez `0002_agent_webhook_autoconfig.sql` avec l'une des trois
méthodes de l'étape 3.

> En local sans domaine public, utilisez `ngrok http 3000` (ou équivalent)
> pour obtenir une URL HTTPS que Supabase peut atteindre.

### 4bis. Pipeline d'agents sur le chat (Phase 2B)

Une fois 0001/0002 appliqués, ajoutez le trigger de messagerie + le
durcissement RLS :

```bash
npx prisma db execute --file supabase/migrations/0003_chat_agent_pipeline.sql
```

### 4ter. Synchronisation Supabase Auth (Phase 3)

Applique les triggers qui gardent `auth.users` (GoTrue) et `public.users`
(Prisma) alignés, y compris le rôle exposé au middleware :

```bash
npx prisma db execute --file supabase/migrations/0004_auth_profile_sync.sql
```

### 5. Lancer l'app

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) — vous serez redirigé
vers `/fr` (ou la langue de votre navigateur parmi fr/en/es).

> Sans base connectée, l'app démarre quand même : chaque vue calendrier
> affiche un bandeau « Base de données non connectée » plutôt qu'une erreur.

## Architecture

```
src/
  app/
    [lang]/                      routes localisées (fr/en/es)
      layout.tsx                 layout racine (html/body, SerwistProvider)
      (dashboard)/calendar/      les 4 vues : month/ week/ day/ mobile/
    manifest.ts, icon.tsx, ...   fichiers PWA/SEO — restent hors [lang]
    sw.ts, serwist/[path]/       source + route du service worker (Serwist)
    api/agents/webhook/          entrée du bus d'agents (Database Webhook)
  components/
    calendar/                   ViewSwitcher, MonthView, WeekView, DayView, MobileView
    ui/                         primitives (Button, Badge)
  lib/
    agents/                     schémas Zod, enqueue/claim/complete, agent de Crise
    calendar/                   grilles de dates, mise en page timeline, formatage
    data/                       requêtes Prisma typées (shifts, employees)
    i18n/                       dictionnaires fr/en/es typés
    supabase/                   clients navigateur / serveur / service-role
  proxy.ts                      détection de langue + redirection (ex-middleware)
prisma/
  schema.prisma                 modèle de données (blindé CNESST)
supabase/migrations/            triggers pg_notify + policies RLS
```

### Le bus d'agents (Loop Engineering)

1. Un trigger Postgres (`enqueue_agent_task`) insère une ligne `agent_logs`
   (statut `PENDING`) et appelle `pg_notify`.
2. Supabase déclenche un **Database Webhook** vers
   `/api/agents/webhook` (fonctionne en serverless, latence ~50-150ms).
3. La route réclame la tâche (`claimAgentTask`, idempotent), exécute le
   handler correspondant (ex. `runCrisisAgent`), puis marque la tâche
   `SUCCEEDED`/`FAILED` — reprise automatique via les retries du webhook.
4. Le client React s'abonne en direct à `agent_logs` via Supabase Realtime
   (`useShiftAgentActivity`) pour afficher « Recherche d'un remplacement… »
   sans polling.

### CNESST

Toute la logique (heures hebdo, pause 30 min, repos 32h) vit dans un trigger
Postgres (`enforce_cnesst_rules`), pas seulement dans l'app — elle s'applique
même si un agent IA écrit directement dans la base.

### Pipeline d'agents sur les messages de chat (Phase 2B)

Chaque message humain inséré dans `chat_messages` réveille le même bus
d'agents que les quarts, via [`0003_chat_agent_pipeline.sql`](./supabase/migrations/0003_chat_agent_pipeline.sql) :

1. Le trigger `notify_chat_message_event()` ignore les messages `AGENT`/`SYSTEM`
   (pas de boucle infinie), résout la succursale du canal/conversation, puis
   appelle `enqueue_agent_task('agent:chat', 'chat.message_posted', …)`.
2. Le Routeur d'Intents ([`lib/agents/intents.ts`](./src/lib/agents/intents.ts))
   analyse le texte (FR/EN/ES) et retourne une intention structurée —
   aujourd'hui `late_arrival`, conçu pour grandir sans changer le trigger.
3. L'**Agent Retard** ([`lib/agents/handlers/late-arrival.ts`](./src/lib/agents/handlers/late-arrival.ts))
   retrouve le quart le plus probable de l'auteur (±quelques heures autour de
   maintenant), le marque `lateArrivalFlag`/`lateArrivalMinutes` (visible dans
   le calendrier), puis pousse une alerte `contentType: "AGENT"` dans le canal
   privé **#gestion** (Owner + Managers, voir `ChatChannelType.MANAGEMENT`).

Réaltime : `chat_messages` doit être dans la publication `supabase_realtime`
(fait automatiquement par 0003) et RLS doit être actif sur les tables de
messagerie — sinon la clé anon publique exposerait tout le chat.

### Authentification Supabase (Phase 3)

[`0004_auth_profile_sync.sql`](./supabase/migrations/0004_auth_profile_sync.sql)
pose trois triggers sur `auth.users`/`public.users` :

1. `set_default_app_metadata()` (`BEFORE INSERT ON auth.users`) — initialise
   `raw_app_meta_data.role = 'EMPLOYEE'` dès la création du compte.
2. `handle_new_user()` (`AFTER INSERT ON auth.users`) — crée la ligne
   `public.users` correspondante (email + `full_name` depuis les métadonnées
   d'inscription). Le rôle n'est **jamais** lu depuis `raw_user_meta_data` —
   le client contrôle ce champ à l'inscription, donc lui faire confiance
   permettrait à quiconque de s'auto-promouvoir Owner/Admin. Toute élévation
   passe par une mise à jour authentifiée de `public.users.role`.
3. `sync_user_role_to_auth_metadata()` (`AFTER UPDATE OF role ON public.users`)
   — répercute une promotion vers `auth.users.raw_app_meta_data`, pour que
   `supabase.auth.getUser()` (qui revalide toujours contre le serveur Auth)
   renvoie le rôle à jour côté edge.

Le middleware ([`src/proxy.ts`](./src/proxy.ts), via
[`lib/supabase/middleware.ts`](./src/lib/supabase/middleware.ts)) rafraîchit
la session Supabase sur chaque requête (après le préfixage i18n existant),
redirige vers `/[lang]/login` si aucune session n'est active, et applique un
role-gating rapide sur `/settings/admin` et `/settings/manager` à partir de
`app_metadata.role` — un filtre de confort côté edge ; la source de vérité
reste `public.users.role`, revalidée par `getSessionUser()` côté page.

> En développement, le blocage est désactivé par défaut (comme le fallback
> de `getSessionUser()`) tant que l'écran `/login` n'existe pas encore :
> passez `AUTH_ENFORCE_DEV=1` pour tester le parcours de redirection en
> local. En production, il est toujours actif.

## Commandes

```bash
npm run dev       # serveur de dev (Turbopack)
npm run build     # build de production
npm run lint      # ESLint
npx prisma studio # explorateur de données Prisma
```

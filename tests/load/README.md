# Load tests — fin de shift (k6)

## Objectif

Simuler le pic **22h** : punch-outs concurrents + Pulse (idempotence `PulseReceipt`)
contre le **staging miroir**, pas la production.

## Prérequis

1. Staging déployé avec :
   - `ALLOW_LOAD_TEST=1`
   - `LOAD_TEST_SECRET` (≥ 16 chars, distinct de prod)
2. [k6](https://k6.io/docs/get-started/installation/) installé localement
3. Quarts seedés / provisionnés sur staging (employés assignés)

## Lancer

```bash
# 1. Préparer N quarts clocked-in + question Pulse de la semaine
BASE_URL=https://staging.mirok.ca \
LOAD_TEST_SECRET=xxx \
COUNT=40 \
npm run test:load:seed

# 2. Burst 5 min (ramping-arrival-rate)
BASE_URL=https://staging.mirok.ca \
LOAD_TEST_SECRET=xxx \
npm run test:load
```

## Seuils (fail CI / local)

| Métrique | Seuil |
|----------|-------|
| `http_req_duration{name:punch_out}` p95 | &lt; 2000 ms |
| `http_req_duration{name:pulse_submit}` p95 | &lt; 500 ms |
| `punch_out_ok` | &gt; 95 % (200 ou 409) |
| `pulse_idempotency_honored` | &gt; 99 % (200 ou 409) |
| `http_req_failed` | &lt; 5 % |

## Routes (staging only)

| Route | Rôle |
|-------|------|
| `POST /api/load/seed` | Prépare fixtures (clock-in fictif, clear receipts) |
| `POST /api/load/punch-out` | Même cœur que `clockOutAction` + CNESST pause |
| `POST /api/load/pulse` | Même cœur que `submitPulseResponseAction` |

Guard : `ALLOW_LOAD_TEST≠1` → **403**. Prod ne doit **jamais** définir ce flag.

## Interdits

- Exécuter contre `app.mirok.ca` / Production
- Réutiliser `LOAD_TEST_SECRET` = `AGENT_WEBHOOK_SECRET`
- Laisser `ALLOW_LOAD_TEST=1` en Production après le test

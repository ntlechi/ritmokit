# Recrutement → Arsimatrix (bati-recruit)

Candidatures externes stockées dans `job_applications`, poussées vers l'usine d'agents.

## Endpoints

| Method | Path | Role |
|--------|------|------|
| POST | `/api/careers/apply` | Intake public + push Arsimatrix |
| GET | `/api/careers/applications` | Liste (PENDING…) pour sync |
| POST | `/api/careers/sync` | Re-push batch PENDING |
| POST | `/api/careers/applications/triage-result` | Callback score / shortlist |

## Env

```env
ARSIMATRIX_ENABLED=true
ARSIMATRIX_URL=http://127.0.0.1:3100
```

## Flux

1. `POST /api/careers/apply` avec `locationId` Bati  
2. Mirok → `POST {ARSIMATRIX_URL}/api/v1/connectors/mirok/webhook`  
3. `bati-recruit` filtre (soir / RTC / FR / MAPAQ)  
4. REPORT → callback triage → status `SHORTLISTED` | `REJECTED`

Voir aussi `C:/Users/Ntlechi/Arsimatrix/docs/MIROK_CONNECTOR.md`.

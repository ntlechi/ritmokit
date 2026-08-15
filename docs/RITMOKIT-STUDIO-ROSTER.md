# Studio enrollment roster API

Powers **Salsa Attitude Admin → Inscrits** (and RitmoKit Accueil-compatible clients).

## Endpoints

### `GET /api/studio/enrollments`

List enrollments for a location (excludes `CANCELLED_INTERAC`).

| Query | Notes |
|-------|--------|
| `locationId` or `locationSlug` (+ `organizationSlug`) | Required for Bearer auth |
| `seasonId` | Optional filter |
| `sessionId` | Optional class filter |
| `paid` / `waitlisted` | `true` / `false` |
| `q` | Name / email / phone / course search |
| `limit` | Default 500, max 1000 |

### `PATCH /api/studio/enrollments`

```json
{ "enrollmentId": "uuid", "attended": true }
```

`attended: null` clears check-in (stored as `false` in DB).

## Auth

1. **Dashboard session** — Accueil+ role cookie (Steve on `app.ritmokit.com`)
2. **Roster secret** — `Authorization: Bearer <RITMOKIT_STUDIO_ROSTER_SECRET>`  
   Used by the Salsa Vercel proxy only. Never expose in `VITE_*`.

Env (RitmoKit):

```
RITMOKIT_STUDIO_ROSTER_SECRET=…   # min 16 chars
```

Env (Salsa Attitude — server only):

```
RITMOKIT_API_URL=https://…ritmokit…
RITMOKIT_STUDIO_ROSTER_SECRET=…   # same value
RITMOKIT_ORGANIZATION_SLUG=salsa-attitude
RITMOKIT_LOCATION_SLUG=quebec
```

Plus browser flag:

```
VITE_RITMOKIT_ENABLED=true
VITE_RITMOKIT_API_URL=…          # public schedule/booking
```

## Salsa wiring

- Proxy: `api/ritmokit-roster.js` (requires Salsa `ADMIN_PIN` session)
- UI: `AdminRosterPanel.jsx` → `fetchRitmoRoster` / `patchRitmoRosterAttendance`
- Client helpers: `src/ritmokit/roster.js`

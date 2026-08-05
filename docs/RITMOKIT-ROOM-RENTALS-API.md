# Room Rentals — Public & Studio API

Source of truth for multi-tenant room/studio rentals. See product spec in the Salsa Attitude repo (`docs/RITMOKIT-ROOM-RENTALS.md`).

## Public (CORS + rate limit)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/public/locations/{locationId}/rooms` | Floors + rentable rooms + settings. Also `?locationSlug=&organizationSlug=` |
| GET | `/api/public/rooms/{roomId}/availability?date=&durationMinutes=` | Slots + day timeline + summary |
| GET | `/api/public/rooms/{roomId}/month-summary?year=&month=&durationMinutes=` | Calendar heatmap cells |
| POST | `/api/public/rental-bookings` | Create privé / B2B (atomic conflict check) |
| GET | `/api/public/rental-bookings/{id}` | Status polling |

Requires `LocationRentalSettings.moduleEnabled = true` and `Station.rentable = true`.

### Create booking body

```json
{
  "roomId": "uuid",
  "date": "2026-09-20",
  "timeStart": "14:00",
  "timeEnd": "16:00",
  "type": "prive",
  "paymentProvider": "interac",
  "client": { "name": "…", "email": "…", "phone": "…", "org": "…" },
  "notes": "…"
}
```

## Studio (session auth, manager+)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/studio/rental-bookings` | `?status=&from=&to=&roomId=` |
| GET | `/api/studio/rental-bookings/pending` | B2B FIFO queue |
| POST | `/api/studio/rental-bookings/{id}/approve` | → confirmed + pending_interac |
| POST | `/api/studio/rental-bookings/{id}/reject` | Optional `{ "reason" }` |
| POST | `/api/studio/rental-bookings` | Staff booking (no payment) |
| PATCH | `/api/studio/rental-settings` | Hours, buffer, rates, module flag |
| GET | `/api/studio/rooms/{roomId}/calendar?date=` | Classes + rentals overlay |
| GET | `/api/studio/payments/interac/pending?kind=rental\|enrollment\|all` | Reconciliation queue |

Studio UI: `/{lang}/rentals`.

## Conflict rules

```
Available =
  open hours
  − ACTIVE session classes on that room
  − pending + confirmed rentals
  − bufferMinutes after each rental (not after classes)
  − minLeadHours for public bookings
```

## Types

- Booking: `prive` \| `b2b` \| `staff`
- Status: `pending` \| `confirmed` \| `cancelled`
- Payment: `none` \| `pending_approval` \| `pending_interac` \| `pending_paypal` \| `paid` \| `waived_staff` \| `cancelled`

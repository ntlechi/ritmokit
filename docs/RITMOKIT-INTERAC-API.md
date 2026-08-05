# Interac Reconciliation — Studio & Public API

Product spec: Salsa Attitude `docs/RITMOKIT-INTERAC-RECONCILIATION.md`.

## Payment statuses (enrollment)

| Status | QR / door | Notes |
|--------|-----------|--------|
| `none` | UNPAID | Free / deferred |
| `pending_interac` | **UNPAID** | Seat reserved; transfer expected |
| `pending_paypal` | UNPAID | Awaiting PayPal capture (`PENDING` + provider PayPal) |
| `paid` | **ALLOW** | Confirmed (Interac manual, PayPal, cash) |
| `cancelled_interac` | CANCELLED | Soft cancel; capacity released |

## Public

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/public/enrollments` | `paymentProvider: "interac"` → `pending_interac` + `ticketCode` + `interacInstructions` |
| GET | `/api/public/enrollments/{id}/payment-status` | Poll `paymentStatus`, `paidAt`, `ticketCode` |

## Studio (session auth)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/studio/payments/interac/pending` | FIFO queue; `?kind=enrollment\|rental\|all` |
| POST | `/api/studio/payments/interac/{enrollmentId}/confirm` | `{ note?, sendConfirmationEmail? }` |
| POST | `/api/studio/payments/interac/{enrollmentId}/cancel` | `{ reason? }` → waitlist promote |
| GET | `/api/studio/payments/interac/stats` | Pending / confirmed / avg hours |
| GET | `/api/studio/enrollments/lookup?ticket=` | QR door lookup (`RK\|uuid` or `SA\|…`) |
| PATCH | `/api/studio/interac-settings` | Deposit email, Q&A hint, staff alerts |

Studio UI: `/{lang}/interac`.

## Location settings

`LocationInteracSettings`: deposit email, security question, password hint, inbox URL, staff notify email, `alertOnPending`.

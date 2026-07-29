# Dance Agentics — Analytics → Agentics

**Status:** Copilot-first (v1)  
**Surfaces:** Accueil (tonight) · Sessions grid · `agent:dance` bus

Paper and spreadsheets tell owners what happened **yesterday**. RitmoKit detects conditions **tonight** and either acts safely or asks once.

---

## Autonomy matrix

| Action | Mode | Trigger |
|--------|------|---------|
| Waitlist promote + pay-link email | **Auto** | Seat frees (public enroll, payment, manager enroll, cancel/no-show release) |
| Unpaid promote reminder email | **Auto** | Cron: promoted, unpaid, class within 24h |
| Accueil / Sessions action cards | **Auto** (surface) | Handler writes UI payload on `agent_logs.result` |
| Soft capacity open (+1 Lead or Follow max) | **Confirm** | Parity alert card → desk/manager tap |
| Churn outreach send | **Confirm** | Cron enqueues `churn.risk_detected`; human sends |
| Room PIN / off-peak yield | **Deferred** | After Phase A payment UAT |

---

## Event → action map

| `event_type` | Handler result `uiKind` | CTA |
|--------------|-------------------------|-----|
| `enrollment.parity_alert` | `parity_imbalance` | `confirm_soft_open` \| `dismiss` |
| `enrollment.waitlist_promoted` | `waitlist_promoted` | `none` (info) or unpaid chase card |
| `enrollment.unpaid_promote_chase` | `unpaid_promote` | `dismiss` |
| `churn.risk_detected` | `churn_risk` | `dismiss` (send stays human) |
| `enrollment.created` / `.paid` | ack | `none` |
| `session.*` / payroll | ack / review | confirm when needed |

---

## Code map

| Piece | Path |
|-------|------|
| Handler | `src/lib/agents/handlers/dance.ts` |
| Webhook dispatch | `src/app/api/agents/webhook/route.ts` |
| Action feed query | `src/lib/dance/agent-actions.ts` |
| Confirm / dismiss | `src/lib/actions/dance-agent-actions.ts` |
| Promote completeness | `src/lib/actions/enrollments.ts` |
| Unpaid chase + churn producer | `src/app/api/cron/dance-agentics/route.ts` |
| Accueil rail | `src/components/accueil/agent-action-rail.tsx` |
| Sessions chips | `src/components/dance/session-class-card.tsx` |

---

## Owner pitch (one line)

> RitmoKit balances rooms, fills waitlists, and flags churn **before class starts** — paper only tells you next month.

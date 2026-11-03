# Relay Admin / Owner Command Center V2 — Phase 5

> **Route:** `/dashboard` when `authCtx.isOwner || authCtx.isAdmin`  
> **Date:** 2026-10-31

---

## CURRENT (pre–Phase 5)

| Piece | Implementation |
|---|---|
| Branch | `dashboard/page.tsx` → `loadAccountabilityDashboard` + `AdminDashboard` + `PipelineAnalyticsView` |
| Metrics | Working today, Day complete, Behind, Team actions |
| Attention | Accountability `attentionItems` (target-focused) |
| Team table | Accountability progress / health fetch per person (`/api/admin/performance`) |
| Analytics | Full pipeline analytics block (heatmaps, charts) |
| Parallel surface | `/admin/command` → `CommandCentre` + `loadTeamDay` (rep-day OS) |
| Stub | `/admin/command-center` → redirects to `/admin/command` |

**Problems:** duplicate admin homes, analytics fan-out on first paint, status model diverges from Manager Home attention policy.

---

## TARGET

Six sections on Admin Home (`/dashboard`):

1. Header (org name · Command Center)
2. Organization health (≤5 metrics)
3. Attention required (canonical attention policy, org-wide)
4. Team execution table (same row status as Manager)
5. Pipeline health (compact funnel + stuck)
6. Important activity (+ profile performance compact)

Owner: same surface + settings/people entry points.

`/admin/command` remains the rep-day Command Centre (day check-in OS) — not deleted.

---

## CANONICAL DATA SOURCES

| Need | Source |
|---|---|
| Team day / replies / day state | `loadTeamDay()` (admin = org) |
| Targets / open leads | `loadTeamLive()` |
| Attention + rep status | `src/lib/team/attention-policy.ts` + `assembleManagerHomeTeamData` |
| Pipeline / stuck | Batched open leads + `qualifyCanonicalScore` / status lanes |
| Profile performance | Revenue identities + assignments + accountability + outbound messages |
| Activity | `action_events` meaningful types (same as Manager) |

---

## PERMISSION MODEL

| Role | Scope |
|---|---|
| REP | No admin command data |
| MANAGER | Managed team only (Phase 4) |
| ADMIN | Organization |
| OWNER | Organization + owner settings links |

Nav hiding is not security — loaders check `authCtx.isAdmin` / `isOwner`.

---

## NO-CHANGE CONTRACTS

- Scoring / follow-up policy / conversation state / RLS
- Manager attention severity thresholds (shared)
- Rep Home five-section model
- Do not invent THREAD_REVIEW / STALE_SCORE / ROUTING_REVIEW without real feeds

---

## IMPLEMENTATION (2026-10-31)

| Piece | Path |
|---|---|
| Loader | `src/lib/team/load-admin-command-center.ts` |
| Assembly | `src/lib/team/admin-command-summary.ts` |
| UI | `src/components/admin/admin-command-center-view.tsx` |
| Dashboard branch | `src/app/(app)/dashboard/page.tsx` (admin/owner) |
| Tests | `tests/admin-command-center.test.ts` |

`/admin/command` (rep-day OS) kept. Analytics removed from Admin Home first paint.

### Debt

- URL filters (team/profile/date) not fully wired — status filter is client-side
- THREAD_REVIEW / STALE_SCORE / ROUTING_REVIEW omitted (no reliable feed)
- Manual assign-task / request-update → Phase 6
- Browser QA pending

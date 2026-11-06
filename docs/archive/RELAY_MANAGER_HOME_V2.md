# Relay Manager Home V2 — Phase 4

> **Route:** `/dashboard` when `authCtx.isManager && managedTeamIds.length > 0`  
> **Date:** 2026-10-31

---

## Scope split (critical)

| Surface | Scope |
|---|---|
| **My work** | Manager as rep — active sending profile (`resolveActiveWorkspace`) |
| **Team** | Managed team members only — **never** filtered by personal profile cookie |

---

## Structure

1. Header (team name · people · attention count)
2. My work (4 personal metrics + compact Do this next ≤5)
3. Needs attention (deterministic signals)
4. Team operational metrics
5. Team table
6. Recent important activity

No pipeline analytics on Manager Home (same perf rule as Rep Home).

---

## Data sources

| Need | Authority |
|---|---|
| Team day / replies / day state | `loadTeamDay()` (batched, scoped) |
| Targets / open leads / goals | `loadTeamLive()` → filtered to managed rep ids |
| Attention | `src/lib/team/attention-policy.ts` |
| Assembly | `src/lib/team/manager-home-summary.ts` |
| Loader | `src/lib/team/load-manager-home.ts` |
| Personal queue | Same `loadRepWorkspaceData` as Rep Home |

---

## Attention categories supported

`REPLIES_WAITING` · `FOLLOWUPS_OVERDUE` · `HIGH_PRIORITY_UNTOUCHED` · `NO_PROFILE_ASSIGNMENT` · `NO_ACTIVITY` · `TARGET_AT_RISK`

Not inventing: `THREAD_REVIEW_REQUIRED`, `TASKS_OVERDUE` (manual tasks) until Phase 6.

Follow-up overdue on the **team table** uses open-lead status lane (`contacted` / `followed_up`) from Team Live — not a second follow-up engine. Per-lead policy remains Rep Home / queue authority.

---

## Debt

- Request update / Assign task: deep links only until Phase 6 persistence
- Oldest reply/follow-up ages not yet measured in batch (severity falls back to count rules)
- Manager “View all my work” → `/chats` (full personal home still shares `/dashboard` route with Manager Home)

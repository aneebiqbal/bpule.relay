# Relay Task System V2 — Phase 6

> **Date:** 2026-10-31  
> **Canonical route:** `/tasks` (Sales left rail; `/relay` remains queue surface)

---

## CURRENT TASK SOURCES

| Source | Location | Nature |
|---|---|---|
| `RelayTask` / `buildRelayQueue` | `lib/relay/queue-engine.ts` | Derived from leads, messages, follow-up policy |
| `NextBestAction` / `rankNextActions` | `lib/relay/next-best-action.ts` | Ranking over queue |
| `RelayTodayAction` | dashboard / Rep Home | Presentation of ranked actions |
| `/relay` | Relay queue page | Derived task list UI |
| Do This Next / My Work | Rep Home | Same derived actions |
| Manager / Admin attention | `attention-policy.ts` | Exception signals, not tasks |
| Notifications | `notifications` table | Alerts (followups_due, day_*) |
| `help_requests` | collaboration | Adjacent, not general tasks |
| `action_events` | ledger | Outcomes of work, not work items |
| Rep-day commitments | `rep_day` / targets | Quotas, not tasks |

**No general-purpose assigned-task table existed before Phase 6.**

---

## DERIVED VS PERSISTED

| Kind | Owner of truth | Persistence |
|---|---|---|
| **Derived** | Lead / conversation / follow-up policy / ranking | Projection only — no duplicate rows |
| **Assigned** | Human (manager/admin) request | `assigned_tasks` rows |

Derived tasks **resolve when source state resolves**.  
Assigned tasks **complete/cancel explicitly** and remain historical.

---

## CANONICAL OWNERS

| Concern | Module |
|---|---|
| Derived projection | `queue-engine` → `rankNextActions` → `toUnifiedTaskFromAction` |
| Priority mapping | `lib/tasks/task-priority-policy.ts` |
| Ranking for Home | `lib/tasks/rank-unified-tasks.ts` |
| Assigned CRUD | `lib/tasks/assigned-tasks.ts` + `/api/tasks` |
| UI | `/tasks`, AssignTaskDialog, home consumers |

---

## DUPLICATIONS (avoided)

- Do not store REPLY/FOLLOW_UP as assigned rows when queue already owns them
- Do not invent due dates for derived items without policy dueAt
- Completing an assigned “send follow-up” note ≠ `FOLLOWUP_SENT` unless outbound recorded

---

## TARGET MODEL

```text
CANONICAL SALES STATE  →  DERIVED UnifiedTask
HUMAN REQUEST          →  ASSIGNED UnifiedTask (assigned_tasks)
                              ↓
                     ONE /tasks workspace + Home ranking
```

Presentation contract: `UnifiedTask` in `lib/tasks/types.ts`.

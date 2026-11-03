# Relay — Phase 8 Database Contracts

> LIVE column updated 2026-11-01 from a read-only production schema dump (no row data). Per-migration detail: `docs/RELAY_MIGRATION_RECONCILIATION_2026-11.md`.

> **Date:** 2026-11-01 · **Owner of the switch:** `src/lib/operations/capabilities.ts` (`RELAY_DB_CAPABILITIES`).
> Production status cannot be read (Supabase gateways return HTTP 402) and production's recorded migration history ends at `20261003000000`. "LIVE" therefore means *unknown until verified*, never assumed.

Legend — **LIVE:** what production is known to have. **LOCAL:** verified on the isolated RLS harness (`supabase/tests/sql/`).

| Dependency | Required columns | RLS expectation | Migration | LIVE | LOCAL | Capability key | Features depending on it |
|---|---|---|---|---|---|---|---|
| `assigned_tasks` | `id, organization_id, assignee_rep_id, created_by_rep_id, lead_id, profile_id, kind, title, description, priority, due_at, status, created_at, updated_at, completed_at, cancelled_at, cancel_reason, previous_assignee_rep_id` | read/update: assignee visible via `can_see_rep` or creator; insert: creator = self | `20261031120000_assigned_tasks.sql` + scope policies in `20261101120000` | **Absent** (schema dump 2026-11-01) | Verified | `assignedTasks` | `/tasks`, `/team/tasks`, task drawer, Rep 360 Tasks, Account Tasks, intervention menu, Cmd-K tasks |
| `task_events` | `id, organization_id, task_id, event_type, actor_rep_id, metadata, created_at`; `TASK_RESCHEDULED` allowed | visible when its task is visible | `20261031120000` + constraint in `20261101120000` | **Absent** | Verified | `assignedTasks` | Task drawer activity, Activity timeline, task-completed counts |
| `internal_notes` + `internal_note_events` | see migration | subject-scoped (`can_access_note_subject`); author-only edit; admin soft-delete; audit follows note | `20261101120000_operations_workspace.sql` | **Not applied** | Verified (32/32) | `internalNotes` | Notes panels (lead, account, rep), Chats intelligence panel, Activity "Internal note" rows |
| `saved_views` | `id, organization_id, owner_rep_id, surface, name, query, scope, created_at, updated_at` | owner only (`for all`) | `20261101120000` | **Not applied** | Verified | `savedViews` | Views menu on Team, Tasks, Activity, Performance, Accounts, Chats, Reports |
| `team_memberships` read for managers | `team_id, person_id, membership_role, active` | own row, admin, or `manages_team(team_id)` | `20261101120000` | **Broken live** (manager sees own row only; possible cross-org read via unscoped `is_org_admin()`) | Verified | `teamScopedActivity` | Every manager surface: People, Teams, Tasks, Activity, Performance, Reports, Chats manager filters |
| `action_events` read for managers | `actor_id, action_type, execution_status, lead_id, job_id, channel, occurred_at` | self, managed reps (`can_see_rep`), referral target | `20261101120000` | **Broken live** for managers | Verified | `teamScopedActivity` | Activity, Performance, Reports, outcome counts on Manager Home |
| Admin authority | `organization_roles.role` | `is_org_admin_or_owner()`; legacy `is_admin()`/`is_org_admin()` delegate | `20261101120000` | **Legacy** (`reps.role`) | Verified | `teamScopedActivity` (same migration) | Every admin-gated policy |
| `MEETING_BOOKED` event | `action_events.action_type = 'MEETING_BOOKED'` | as `action_events` | `20261101130000_meeting_booked_event.sql` | **Not applied** — inserts are rejected and swallowed until applied | Constraint file only | `meetingEvents` | Meeting counts everywhere (homes, Rep 360, Performance, Reports, Targets) |
| `notifications` | `id, organization_id, recipient_id, notification_type, title, body, link, dedupe_key, read, created_at` | recipient only | `0085` shape via `20261101135000_notifications_canonical_shape.sql` | **Wrong shape + RLS OFF + anon `GRANT ALL`** (0088 shape: rep_id/type/message) — security escalation | Verified (19/19 activation harness) | `notifications` (probe checks the canonical columns) | `/notifications`, header bell, task assignment notices |
| `notifications` dedupe | unique `(organization_id, recipient_id, dedupe_key)` | — | `20261101140000_notification_dedupe.sql` (after `…135000`) | **Missing** — no canonical columns yet | Verified | `notifications` | Notification idempotency |
| `daily_targets` | `organization_id, rep_id, revenue_identity_id, activity_type, target_count, active` | org-scoped | `0088` / `0091` | **Live** (table + 8 policies in dump) | Not in harness | `targets` | Targets V2 (read-only), Admin targets manager |
| `lead_message_previews` view | `lead_id, organization_id, direction, thread_status, sent_at, preview` (160 chars) | `security_invoker` — caller's `messages` RLS; anon revoked | `20261101150000_lead_message_previews.sql` | **Absent** | Verified (activation harness) | `messagePreviews` | `/chats` queue previews (fallback reads full bodies until applied) |
| `conversation_states` | `lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at, memory` | org-scoped | `0036` | Live | — | (none — core) | Chats queue, Rep 360 / Account conversations, Pipeline report |

## Rules

1. A feature whose capability is `false` renders **"Available after database activation"** and its API returns `503 { available: false }`. It never returns a fake success.
2. Capabilities come from `RELAY_DB_CAPABILITIES` (`all` / `none` / comma list) or a process-cached probe (10 min). Constraint-level capabilities (`meetingEvents`) are env-only.
3. Activation flips the env **after** the RLS harness passes on a non-production copy (runbook: `docs/RELAY_OPERATIONS_WORKSPACE_V2.md` §11).

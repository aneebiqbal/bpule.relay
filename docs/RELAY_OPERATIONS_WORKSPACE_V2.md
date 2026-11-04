# Relay — Operations Workspace V2 (Sprint 1 · Phase 8)

> **Status:** Phase 8.0 audit complete · Slice A built (code + tests), migration written but **not applied** · Slices B–D open (see §6).
> **Date:** 2026-11-01
> **Sources:** `src/app/(app)/**`, `src/lib/{team,tasks,rep-day,admin,leads,conversation}/**`,
> `src/lib/auth/organization.ts`, `src/lib/navigation/relay-shell-nav.ts`,
> `supabase/migrations/**`, `docs/archive/RELAY_INFORMATION_ARCHITECTURE_V2.md`,
> `docs/RELAY_TASK_SYSTEM_V2.md`, `docs/archive/RELAY_NEON_MIGRATION.md`.

Phase 8 turns Relay's separate team, task, lead and account pages into one
operations workspace. This doc records what exists, what each Phase 8 surface
reuses, and what is still missing. It is the "no duplicate functionality" gate:
every new surface below names the canonical loader it reads.

---

## 1. Findings that change the plan

These were found during the audit and come before any UI work.

### 1.1 Manager team scope collapses to "self" at the database layer

`resolveTaskAssigneeScope()` (`src/lib/tasks/assigned-tasks.ts`) and
`scopedRepIds()` (`src/lib/rep-day/team.ts`) both read `team_memberships` with
the **user-scoped** Supabase client to expand a manager's team. The only
`team_memberships` select policy (`20260923000000_organization_v2.sql`) is:

```sql
person_id in (select id from reps where auth_user_id = auth.uid()) or is_org_admin()
```

A non-admin manager therefore reads only **their own** membership row, so the
team set comes back as `{ manager }`. Every manager surface built on these
helpers (Manager Home team block, `/tasks` team view, `/admin/command`) shows
less than the app layer intends. It fails closed: the bug hides data, it does not leak it.

The same policy also references `team_memberships.organization_id`, which the
table definition does not have. The live policy state cannot be confirmed from
the repo (Supabase is egress-restricted, see `../archive/RELAY_NEON_MIGRATION.md`).

### 1.2 Managers cannot read their team's `action_events`

`ae_select` allows `is_admin()` (legacy `reps.role = 'admin'`), the actor, or
the referral target. Manager Home's "recent team activity" and any manager
activity feed therefore only return the manager's own events.

### 1.3 `is_org_admin()` / `is_admin()` read `reps.role`, not `organization_roles`

The app treats `organization_roles` as canonical (`resolveAuthContext`), but
RLS helpers still key off `reps.role = 'admin'`. An org ADMIN whose `reps.role`
is `rep` passes every app gate and is then denied by RLS.

**Response (Slice A):** migration `20261101120000_operations_workspace.sql` adds
SECURITY DEFINER helpers `is_org_manager_of(rep_id)` and `has_org_admin_role()`
and extends the `team_memberships`, `action_events` and `task_events` select
policies to include managed-team members. It is **written, not applied**. The
team must run it against staging first (see §8).

### 1.4 Account 360 is N+1 and loads the whole book

`/account?companyKey=` calls `store.listOwnedLeads()` (all leads), filters in
memory, then `store.listMessages(id)` **per lead**. It is the largest egress
risk on any detail page. `/accounts/[company]` replaces it with two bounded
reads.

---

## 2. Coverage matrix

Legend — **State:** EXISTS · PARTIAL · DUPLICATED · MISSING. **Action:** KEEP · MERGE · REBUILD.

| Area | State | Where it lives today | Action | Phase 8 canonical surface |
|---|---|---|---|---|
| **People** | DUPLICATED | `/admin/people` (roles + invites, admin only), `/team` (`TeamLiveBoard` cards), Manager Home team table (`ManagerTeamRow`), Admin Command Center rows | **MERGE** | `/team` People table built on `assembleManagerRepSnapshots` rows (one row contract). `/admin/people` stays as the role/invite admin tool, linked from the rail |
| **Teams** | PARTIAL | `teams` + `team_memberships` tables; `store.listTeams()`; no team page; team name shown only as Manager Home title | **REBUILD** | `/team/groups` + `/team/groups/[teamId]` |
| **Tasks** | EXISTS | Phase 6 canonical engine: `assigned_tasks`, `task_events`, `loadUnifiedTasks`, `/tasks` (`TaskWorkspaceView`), `AssignTaskDialog`, `PATCH /api/tasks/[id]` | **KEEP** | Same engine. New `/team/tasks` board (group by rep / priority / due) and task detail drawer reuse `listAssignedTaskRows` and the PATCH route. No second task state machine |
| **Rep detail** | DUPLICATED | `/team/[repId]` (`ManagerDrillDown`: identities, day closes, 12 open leads), `/admin/command/[repId]` (rep day detail via `loadRepDayDetail`) | **REBUILD** `/team/[repId]` · **KEEP** `/admin/command/[repId]` | `/team/[repId]` becomes Rep 360 with tabs. Day-close / check-in detail stays on `/admin/command/[repId]` and is linked as "Daily operations" |
| **Activity** | PARTIAL | `action_events` ledger; Manager Home `loadRecentTeamActivity` (10 rows, label only); `/admin/activity` redirect stub; `/performance` personal heatmap | **REBUILD** | `/team/activity` + Rep 360 Activity tab, both reading one timeline mapper over `action_events` ∪ `task_events` |
| **Companies** | PARTIAL | `leads.company` / `company_key` only; no companies table | **REBUILD** (derived) | `/accounts` groups leads by `company_key`. No new table, no second company writer |
| **Accounts (360)** | PARTIAL | `/account?companyKey=` (`Account360View`), N+1, unbounded | **REBUILD** | `/accounts/[company]`; `/account?companyKey=` redirects there |
| **Pipeline** | EXISTS | `/leads?view=pipeline` (`LeadsBoardV2`), stages from `derivePipelineStage` | **KEEP** | Unchanged. Reports → Pipeline links into it |
| **Performance** | DUPLICATED | `/performance` (personal heatmap), `/team` live board, `/accountability`, Admin Command Center profile rows, `/admin/revenue-intelligence` | **MERGE** | `/team/performance`: activity counts, conversion, rep / profile / source comparison from `action_events` + lead outcomes. Personal `/performance` stays rep-only |
| **Targets** | EXISTS | `/admin/targets` (`TargetsManager`), `daily_targets`, `revenue_identity_contracts`; admin-only | **KEEP** (rehome) | Linked from the Team rail. Per-team / date-range targets are **not** in Slice A |
| **Reports** | PARTIAL | `/performance`, `/admin/revenue-intelligence`, `/admin/ai-usage`, team pages | **MERGE** (later) | Reports rail restructure deferred to Slice C (§6) |
| **Notifications** | PARTIAL | `notifications` table, `NotificationCenter` (flat list, unread count), task assignment notifications | **REBUILD** (later) | Categories + deep links deferred to Slice C |
| **Internal notes** | MISSING | — (no table; `assigned_tasks.description` is the only free text) | **BUILD** | `internal_notes` table (org-scoped, author, audit columns) + `/api/notes` + `NotesPanel` on Rep 360 and Account 360 |
| **Admin interventions** | PARTIAL | `AssignTaskDialog`, lead reassign via `/leads/[id]?tab=owner`, task reassign/cancel | **MERGE** | One `InterventionMenu` (assign task, request update, open conversation, open account, add note) reused on Team surfaces |
| **Saved views** | MISSING | `LEADS_VIEWS` presets only (not user-defined) | **BUILD** | `saved_views` table (owner + surface + query string) + `/api/saved-views` + `SavedViewsMenu` |
| **Global search** | PARTIAL | `/api/search` → `archiveSearch` (leads, proof, upwork, conversations, identities, studio); palette has static commands | **MERGE** (later) | Grouped People / Companies / Leads / Tasks results deferred to Slice B |
| **Daily operations** | EXISTS | `/admin/command` (`CommandCentre` over `loadTeamDay`) | **KEEP** | Shown in the Team rail as "Daily operations". Not duplicated on Home |
| **Conversation workspace** | DUPLICATED | `/chats` (bucket list), `/relay` (queue), `/inbound`, lead detail conversation tab | **REBUILD** (later) | Three-pane `/chats` deferred to Slice B. Rep 360 Conversations tab ships in Slice A |

---

## 3. Reuse map — what each new surface reads

| Surface | Canonical reads (no new engine) |
|---|---|
| `/team` People | `loadTeamDay` + `loadTeamLive` + `countOverdueAssignedByRep` → `assembleManagerRepSnapshots` → `deriveRepStatus`; plus one `team_memberships` read for team names and one `reps` read for role |
| `/team/[repId]` Overview | same snapshot row for that rep + `listAssignedTaskRows({ assigneeRepId })` + rep's `action_events` today |
| `/team/[repId]?tab=leads` | `loadLeadsPage({ owner: repId, scope })`; the existing `LeadsTable` with a `basePath` |
| `/team/[repId]?tab=tasks` | `listAssignedTaskRows` → `toUnifiedTaskFromAssigned`; actions via `PATCH /api/tasks/[id]` |
| `/team/[repId]?tab=conversations` | `conversation_states` (stage, last_sent_at, last_reply_at, next_followup_at) for the rep's open leads; narrow columns |
| `/team/[repId]?tab=activity` / `/team/activity` | `action_events` ∪ `task_events`, mapped by `src/lib/operations/activity.ts` |
| `/team/performance` | `action_events` counts by actor / sender profile / channel; lead stage counts for conversion |
| `/team/groups[/id]` | `teams`, `team_memberships`, snapshot rows filtered to members |
| `/team/tasks` | `listAssignedTaskRows` (scoped) + `classifyUnifiedTaskTab` |
| `/accounts` | `leads` grouped by `company_key` (list columns only) |
| `/accounts/[company]` | `leads` for one `company_key` + `conversation_states` + `action_events` + `assigned_tasks` for those lead ids |

---

## 4. Permission model (unchanged authority)

| Role | Operational scope | Source of truth |
|---|---|---|
| REP | own rep id | `resolveTaskAssigneeScope → mode 'own'` |
| MANAGER | managed team members + self | `resolveTaskAssigneeScope → mode 'team'` (subject to §1.1) |
| ADMIN / OWNER | organization | `mode 'org'` |

`src/lib/operations/scope.ts` wraps that one resolver. Every Phase 8 loader
calls `resolveOperationalScope()` and `assertRepInScope()` on the server; a rep
id in the URL that is outside scope returns `notFound()` instead of an empty page.
Client filters only narrow what the server already allowed.

---

## 5. Egress rules for Phase 8 loaders

- No `select('*')` on `leads`, `messages`, `conversation_states`, `action_events`.
- No `canonical_intelligence`, `raw_input`, `raw_source_data`, `evidence_ledger`, `score_breakdown`, embeddings or AI traces on list pages.
- Message bodies are never read on Team / Accounts lists. Conversation rows use `conversation_states` timestamps.
- Every list read is bounded (`limit`) and filtered by `organization_id` first.
- Per-rep / per-lead loops are banned. Reads are batched with `.in(...)`.

---

## 6. Delivery slices

Phase 8 is 48 sub-phases. It ships in slices, each releasable on its own.

| Slice | Phases | Status |
|---|---|---|
| **A — Team & Accounts core** | 8.0 audit · 8.1 Team directory · 8.2–8.7 Rep 360 (all tabs) · 8.8 internal notes · 8.9–8.10 Teams · 8.11–8.12 task board + drawer · 8.13–8.17 Accounts · 8.20 Activity center · 8.21–8.25 Performance · 8.27 Daily ops in rail · 8.28 intervention menu · 8.30 grouped Cmd-K · 8.31 saved views · 8.39 URL state · 8.40 scope · 8.42 egress | **built** — code-verified only (§9) |
| **B — Conversation workspace** | 8.18 three-pane `/chats` (list / thread / intelligence) · 8.19 admin oversight on `/chats` (rep / profile / proposal / meeting filters). Oversight views (waiting >4h / >12h) already ship on Rep 360 and Team detail | not started |
| **C — Reports, targets, notifications** | 8.26 team / date-range targets · 8.29 notification categories · 8.32–8.35 Reports rail | not started |
| **D — Verification & cleanup** | 8.41 perf measurement · 8.43 responsive screenshots · 8.44 a11y audit · 8.46 browser QA by role · 8.47 deprecations | blocked on a reachable database (§8) |

---

## 7. Deprecation candidates (classify, do not delete)

| Route | Replaced by | Class |
|---|---|---|
| `/account?companyKey=` | `/accounts/[company]` | redirect |
| `/team/[repId]` `ManagerDrillDown` view | Rep 360 | remove later (component kept until tests prove unused) |
| `/admin/activity` | `/team/activity` | redirect (currently → `/admin/command`) |
| `/team` `TeamLiveBoard` | `/team` People table | remove later |
| `/admin/people` | stays as admin tool | internal (linked from Team rail) |

---

## 8. Open blockers

1. **Supabase is egress-quota blocked, not migrated.** The Supabase project
   returns HTTP 402 (`exceed_egress_quota`) on every gateway; direct Postgres
   and the read-only Management API still work. The schema and all data have
   been migrated to a Neon branch (`migration-validation`) with zero row and
   hash differences — see `docs/archive/RELAY_NEON_MIGRATION_FINAL.md`. **The app has
   not been repointed**: Relay still talks to Supabase through PostgREST, which
   Neon does not provide, so browser QA by role, performance measurement and
   screenshots against live traffic remain blocked until the data-access layer
   is migrated.
2. **Migration applied to the migration branch, not to production.** The
   operations migration was applied to `migration-validation` (Neon) and passes
   the §10.2 harness 32/32. Production still runs the pre-Phase-8 policies
   (history ends at `20261030000000`; see §11 of the migration report), so
   manager scope stays collapsed there per §1.1. Production activation needs
   owner approval (§10.3).
3. **PII.** Verification against production rows is a team task (org rule);
   automated tests use synthetic fixtures only.

---

## 9. Slice A — what shipped

### Routes

| Route | Phase | Notes |
|---|---|---|
| `/team` | 8.1 | People table (role, team, profile, open leads, replies waiting, overdue tasks, meetings, wins, target %, status). Team / status / search filters in URL. Saved views. Attention list. Every count links to its records |
| `/team/[repId]` | 8.2–8.7 | Rep 360. Header + streamed metrics; tabs `overview · leads · tasks · conversations · activity · performance` as `?tab=`. Only the active tab loads. Out-of-scope rep id → 404 |
| `/team/groups` | 8.9 | Team list with manager, members, active leads, replies waiting, overdue tasks, meetings |
| `/team/groups/[teamId]` | 8.10 | Team detail, same tab model. Managers: only managed teams (404 otherwise) |
| `/team/tasks` | 8.11–8.12 | Task board: views `all · overdue · today · upcoming · completed`, group by rep / priority / due date, `?task=` drawer with start / complete / reassign / change due date / cancel / open lead + lifecycle |
| `/team/activity` | 8.20 | Activity center: date, team, rep, profile, event type, source filters |
| `/team/performance` | 8.21–8.25 | Execution counts, conversion funnel (count + %), rep / profile / source comparison |
| `/accounts` | 8.13 | Company table derived from `company_key`; admin/owner only |
| `/accounts/[company]` | 8.14–8.17 | Account 360, scoped per viewer; tabs `overview · people · opportunities · conversations · tasks · activity` |
| `/account?companyKey=` | — | Now redirects to `/accounts/[company]` (removes the N+1 loader) |

### APIs

| Route | Purpose |
|---|---|
| `GET/POST /api/notes`, `PATCH/DELETE /api/notes/[id]` | Internal notes; subject access checked against operational scope |
| `GET/POST /api/saved-views`, `DELETE /api/saved-views/[id]` | Owner-private saved views per surface |
| `GET /api/search/ops` | Grouped Cmd-K search (people, companies, leads, tasks, conversations), scoped |
| `GET /api/tasks/[id]`, `PATCH … action: 'reschedule'` | Task drawer detail + due-date change (`TASK_RESCHEDULED` audit event) |

### Shared modules (`src/lib/operations/`)

`scope` · `filters` (URL state) · `activity` (timeline mapper + loader) · `performance` (metrics, funnel, comparisons) · `people` (directory + team roll-ups) · `rep-360` · `conversations` · `accounts` · `notes` · `saved-views` · `global-search` · `page-context` (per-request cached auth/scope/directory/performance).

### Changed existing code

- `relay-shell-nav.ts` — Team rail = People / Teams / Tasks / Activity / Performance / Daily operations (+ Targets, Access & roles for admins); `/admin/command` now lives under Team (8.27); Accounts top nav → `/accounts`; Home rail "Command" replaced by "My tasks"; `adminOnly` flag replaces the "hide every `/admin/*` link" rule that hid Daily operations from managers.
- `LeadsTable` — `basePath` + `fixedParams` so Rep 360 reuses it.
- `Drawer` — focus moves into the panel on open and returns on close.
- Lead detail — internal notes panel below (never inside) the thread.
- Command palette — grouped record search above commands; Team / Accounts commands.

### Known differences and limits (not hidden)

1. **Sends vs drafts.** Team performance counts executed events only. The personal `/performance` heatmap (`activity-model.ts`) still maps `CONNECTION_PREPARED` / `DM_PREPARED` to sends, so the two can disagree. Reconcile in `activity-model.ts` with a regression test.
2. **Meetings.** `MEETING_BOOKED` is read by several loaders (Manager Home, Admin Command Center) but nothing emits it and the `action_events_action_type_check` constraint does not allow it, so ledger meeting counts are always 0. Phase 8 counts meetings from `conversation_states.stage` (leads that reached meeting or later) and links them to the meeting-stage conversations. Emitting the event needs a constraint change plus an emitter.
3. **Team directory "Meetings" / "Wins"** are today's goal completions (Manager Home contract); Rep 360 header shows 7-day ledger counts and labels them "· 7d".
4. **Accounts list** groups the 2,000 most recent leads in memory and says so when truncated. A SQL view / RPC grouped by `company_key` is the scalable follow-up.
5. **Industry and revenue** are not stored per company. The account pages show Region and "Revenue: Not tracked" rather than inventing values.
6. **Derived tasks for another rep** are not recomputed (the queue engine is per signed-in user). Rep 360 Tasks shows assigned tasks plus derived *counts* from conversation state, linking to the conversations behind them.
7. **Manager scope** remains collapsed to self until the migration's `tm_select` change is applied (§1.1).

### Verification status

| Gate | Status |
|---|---|
| `tsc --noEmit` | PASS |
| vitest | PASS — 306 files / 4,486 tests (49 new in `tests/operations-workspace.test.ts`) |
| `next build` | PASS — all `/team/*`, `/accounts`, `/accounts/[company]` routes compiled |
| eslint (changed files, errors) | PASS — remaining warnings are `Date.now()` in server components (same pattern as `/leads`) and two pre-existing |
| Browser QA by role, responsive screenshots, perf timings | **not run** — no reachable database (§8.1) |

---

## 10. Slice B — activation status (2026-11-01)

### 10.1 Migration audit → rewrite

`20261101120000_operations_workspace.sql` was rewritten after a line-by-line audit:

| Finding in the Slice A draft | Fix |
|---|---|
| `tm_select` keyed on `person_id`: a manager also saw a member's rows in teams they do **not** manage | Keyed on `manages_team(team_id)` |
| Two parallel admin checks (`is_org_admin() or has_org_admin_role()`) | One authority `is_org_admin_or_owner()`; `is_admin()` / `is_org_admin()` delegate to it, so every existing policy that calls them (≈52 `is_admin()` clauses, 17 files using `is_org_admin()`) follows `organization_roles` |
| `internal_notes` readable by every org member via the API (incl. manager notes about a person); audit `previous_body` org-readable | Subject-scoped read/write in the DB (`can_access_note_subject`); REP notes visible to that rep's managers + admins, not the subject; audit rows follow the note |
| Author could re-point a note's subject/author; admin could rewrite another author's body | `internal_notes_guard` trigger: subject/author/created_at immutable, body author-only, no un-delete |
| `assigned_tasks` / `task_events` readable org-wide | Follow rep / manager / admin scope (`can_see_rep`); reassignment outside scope rejected by `WITH CHECK` |

**Admin-authority behaviour change** (intended — aligns the DB with `resolveAuthContext`):
`reps.role='admin'` + `organization_roles` MANAGER/MEMBER → loses DB admin; `organization_roles` ADMIN/OWNER + `reps.role<>'admin'` → gains DB admin. Legacy `reps.role='admin'` still counts only when the person has **no** `organization_roles` row.

### 10.2 Live RLS verification (isolated Postgres)

Production cannot be used for this and there is no staging. The policies were exercised as real `authenticated` sessions (JWT claims) on a throwaway `supabase/postgres:17.6` container, using the harness in `supabase/tests/sql/`:

```bash
psql … -f supabase/tests/sql/operations_workspace_rls_fixture.sql   # pre-Phase-8 helpers + policies
psql … -v after=false -f supabase/tests/sql/operations_workspace_rls.sql
psql … -1 -f supabase/migrations/20261101120000_operations_workspace.sql   # applied twice: idempotent
psql … -v after=true  -f supabase/tests/sql/operations_workspace_rls.sql
```

| Phase | Pass | Fail | Notes |
|---|---|---|---|
| before | 8 | 3 | Reproduces both known bugs (manager sees 1/3 memberships, 1/3 team events) **and** a third: a second-org legacy admin reads all of org A's `team_memberships` (old `tm_select` grants on unscoped `is_org_admin()`) |
| after | **32** | **0** | Manager/rep/admin/owner/second-org scope; admin authority from `organization_roles`; task scope + reassignment guard; notes scope, immutability, author-only edit, admin soft-delete, private audit; saved views private |

Limits: the fixture holds only the tables these policies touch (the full 139-file chain does not replay from scratch — 94 files fail on drift, matching `../archive/RELAY_NEON_MIGRATION.md` §1.4). This proves the policies, not the production schema.

### 10.3 Activation runbook (needs a decision — not executed)

Preconditions, in order:

1. **Migration backlog.** Production's recorded history ends at `20261003000000`; 52 newer files are unrecorded. This migration alters `assigned_tasks` / `task_events` (`20261031120000`). Reconcile which of the 52 are live before applying anything.
2. **Read-only pre-checks** (metadata / counts only, no PII):
   ```sql
   select tablename, policyname, qual from pg_policies
    where tablename in ('team_memberships','action_events','assigned_tasks','task_events');
   select count(*) filter (where r.role = 'admin' and o.role in ('MANAGER','MEMBER')) as lose_admin,
          count(*) filter (where r.role <> 'admin' and o.role in ('ADMIN','OWNER'))  as gain_admin
     from reps r join organization_roles o on o.person_id = r.id and o.organization_id = r.organization_id;
   ```
3. Apply `20261101120000_operations_workspace.sql` then `20261101130000_meeting_booked_event.sql` to a **non-production** copy, run the RLS harness against it, then production with owner approval.
4. Re-run §10.2 `after` checks plus browser QA by role (Slice D).

### 10.4 Canonical truth fixes

**Meetings.** `POST /api/leads/[id]/status` (`meeting_booked`) set the lead to **won** and emitted **CLIENT_WON** — every booked meeting was recorded as a win, and `MEETING_BOOKED` (read by several loaders) was never emitted and was rejected by the constraint. Now:

- canonical model in `src/lib/sales/meetings.ts`: *when* = `MEETING_BOOKED` event; *now* = `conversation_states.stage = 'meeting'`;
- the route sets the stage, emits `MEETING_BOOKED`, and leaves lead status alone (dataset still captures `meeting`);
- `20261101130000_meeting_booked_event.sql` adds the type to the constraint (ledger parity test updated via `ActionEventType`);
- Rep Home scoreboard, Manager Home, Admin Home (rows + "meetings this week", previously counted from a 40-row activity sample), People directory, Rep 360, Team Performance all count meetings/wins with `loadOutcomeEventCounts` — goal completions no longer override events;
- historical meetings recorded as wins are **not** re-labelled.

Still on other definitions (debt): ML dataset builders `src/lib/admin/training-data.ts` and `src/lib/relay/historical-outcomes.ts` test `lead.status === 'meeting_booked'`, a status that never exists; Admin Home profile rows read meetings from `daily_accountability`.

**Drafts ≠ sends.** `activity-model.ts` (personal `/performance`, My Day card, heatmap) mapped `CONNECTION_PREPARED`, `DM_PREPARED` and `UPWORK_PROPOSAL_PREPARED` to sends/applications and counted failed sends. `canonicalActionFor()` now drops drafts and failures — the same rule as Team Performance. Personal counts will drop where reps drafted without sending; that is the correction.

Tests: `tests/meeting-and-send-truth.test.ts` (MEETING_PARITY, MEETING_IS_NOT_A_WIN, DRAFT_NOT_SENT).

---

## 11. Slice C — remaining surfaces (code-complete, not browser-verified)

| Surface | Route | Data contract | DB dependency (capability) |
|---|---|---|---|
| Conversation workspace | `/chats` | queue: `loadChatQueue` (leads + `conversation_states` scalars + 140-char previews for the visible page); thread: existing `LeadConversation` (`variant="thread"` — canonical messages, composer, quality gates, send / log sent, drafts); right pane: `loadChatIntelligence` (one lead, canonical score / intent / thesis / facts, open tasks) | tasks panel → `assignedTasks`; notes → `internalNotes` |
| Queue views | `?view=` | waiting on me / them, follow-ups, meeting & proposal requests (canonical last client intent), closed; managers + admins: >4h, >12h, unassigned, thread review | — |
| Reports rail | `/reports/{sales,pipeline,team,activity,revenue}` + AI usage | zero-row `COUNT` requests (`head: true`) with scope on `leads` / `actor_id`; Team report reuses the bounded event read (no GROUP BY without an RPC) | `teamScopedActivity` for managers |
| Targets V2 | `/team/targets` | stored `daily_targets` goals; progress = executed events; WEEK/MONTH goals derived (labelled); every cell drills to `/team/activity` | `targets`; team / custom / pause / archive / meeting goals need persistence (not built) |
| Notifications | `/notifications` + header bell | `notifications` table only (the old localStorage bell was never written to); `notifyOnce` = one writer with check-then-insert + unique-violation handling; rules in `src/lib/notifications/model.ts` | `notifications`; unique index migration `20261101140000` (not applied) |
| Cmd-K | palette | grouped records + role-aware commands (`commandVisible`); combobox / listbox semantics; focus returns on close | — |
| Capability registry | `src/lib/operations/capabilities.ts` | `RELAY_DB_CAPABILITIES` env or a 10-min cached probe; write routes return `503 { available: false }`, reads return `available: false` | — |
| Instrumentation | `RELAY_PERF_LOG=1` | `measureLoader` logs `ms`, query count, payload bytes for chats queue / intelligence, directory, performance, sales / pipeline / revenue reports | — |

Deep-link contract: lead → `/leads/:id` · conversation → `/chats?lead=:id` · task → `/tasks?task=assigned:<id>` (focused row) · company → `/accounts/:key` · pipeline stage → `/chats?cstage=<group>`.

Known gaps (honest):
- Three panes start at **1280px** (`xl`), not 1024: with the shell rail, 1024px leaves ~180px for the thread. 768–1279 = queue + thread with the intelligence drawer; <768 = list → thread → drawer.
- Inbound-reply / meeting-request / proposal-request / lead-reassigned / overdue notifications have rules and dedupe keys but are **not yet emitted** from their write paths (inbound replies are logged by the owner themselves, so the rule correctly skips self-notifications today). Task assigned / reassigned / update requested / cancelled are emitted.
- Thread-review counts are computed on the visible page (the verification flag lives on messages).
- Notifications opened from `/notifications` are not auto-marked read (the bell does; the page has "Mark all read").

## 12. Activation runbook (exact sequence)

0. **Security first (needs Security/GRC review).** Production `notifications` and seven other public tables have RLS off and `GRANT ALL` to `anon` (`docs/RELAY_MIGRATION_RECONCILIATION_2026-11.md` §5.2, §6). `20261101135000_notifications_canonical_shape.sql` closes the notifications exposure and is independent of everything else; the other seven tables need their own reviewed policies.
1. **Reconcile production migration history**: done read-only on 2026-11-01. See `docs/RELAY_MIGRATION_RECONCILIATION_2026-11.md`: 47 files present but unrecorded, 6 listed files plus 2 new ones truly need applying, and duplicate versions (`0090`, `0091`, `20261008000000`, `20261009000001`, `20261019000003`) must be fixed before any `migration repair` or `db push`.
2. **Create a non-production copy** — Supabase branch or Neon `migration-validation` with Supabase-compatible auth claims (`auth.uid()` must read `request.jwt.claims`; see `supabase/tests/sql/auth_uid_shim.sql`).
3. **Apply in order**: `20261023000000`, `20261029120001`, `20261031120000_assigned_tasks.sql`, `20261101120000_operations_workspace.sql`, `20261101130000_meeting_booked_event.sql`, `20261101135000_notifications_canonical_shape.sql`, `20261101140000_notification_dedupe.sql`, `20261101150000_pin_security_definer_search_path.sql`, `20261101151000_lead_message_previews.sql`, `20261101160000_close_anon_exposure.sql` (full order and notes: `docs/RELAY_MIGRATION_RECONCILIATION_2026-11.md` §7). Run the admin-authority count (§10.3) before `…120000`.
4. **Run the RLS harnesses** — `operations_workspace_rls.sql` (`after=true`) 32/32 and `phase8_activation_checks.sql` (`after=true`) 19/19, both already green on an isolated production-shaped copy (reconciliation doc §9.1); repeat the role checks against real rows.
5. **Flip capabilities** on the copy: list only the verified keys (`assignedTasks,internalNotes,savedViews,teamScopedActivity,meetingEvents,notifications,targets,messagePreviews`), not `all`, unless each is confirmed.
6. **Role browser matrix** — REP / MANAGER / ADMIN / OWNER: Home → lead → `/chats` → task → account → Team → Activity → Performance → Reports → Notifications. No dead links, no permission leaks.
7. **Fix real-data defects** found in 4–6; re-run the automated gate.
8. **Screenshots** — Rep / Manager / Admin Home, Team, Rep 360, Team Tasks, Accounts, Account 360, Chats, Activity, Performance, Reports, Targets, Notifications.
9. **Performance** — `RELAY_PERF_LOG=1`; record ms / queries / bytes per route; `EXPLAIN (ANALYZE, BUFFERS)` the five largest reads (egress audit §4).
10. **Responsive** — 1440 / 1280 / 1024 / 768 / 375; Chats pane model as above; no horizontal overflow.
11. **Accessibility** — keyboard through tabs, filters, drawers, dialogs, Cmd-K, notifications; focus return; no colour-only state.
12. **Production activation** — with owner approval: apply 3 → set capabilities → smoke test 6 on production.

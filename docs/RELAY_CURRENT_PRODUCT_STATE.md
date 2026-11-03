# RELAY CURRENT PRODUCT STATE

**Authority:** code + tests on `release-merge` @ `a2983dd`. Docs describe intent;
this file describes what is actually wired.

---

## 1. HOME

| | |
|---|---|
| Route | `/dashboard` |
| Components | `RepDashboard` (rep) · `ManagerHomeView` (manager) · `AdminCommandCenterView` (admin/owner) |
| Loaders | `buildRoleContext`, `buildRelayQueue`, `rankNextActions`, `deriveTodayCounts`, `loadTeamDay`, `assembleAdminCommandCenter` |
| Data | Neon `action_events`, `assigned_tasks`, targets, `conversation_states` via the SQL aggregates when available |
| Roles | all |
| Status | code complete · fixture + contract verified · live auth certification pending |

---

## 2. SALES

| Surface | Route | Loader / data | Roles |
|---|---|---|---|
| Prospects | `/prospect` | profile scoring, source adapters | all |
| Leads | `/leads` | `loadLeadsPage`, `loadBoardPreview` | all |
| Pipeline | `/leads?view=pipeline` | `pipelineStageSql` + `derivePipelineStage` | all |
| Import | `/leads/import` | bulk CSV | all |
| Companies | `/accounts` | account 360 | Admin/Owner |
| Upwork | `/upwork`, `/upwork/new`, `/upwork/[id]` | job extraction + scoring | all |
| Email | `/revenue/email` | send workspace | all |
| Lead 360 | `/leads/[id]` | `getLead(id, LeadReadScope)` + `canOpenLead` | scope-aware |

`Lead 360` authorization is one authority: organization boundary + operational
scope. A denial is indistinguishable from a missing lead.

---

## 3. INBOX

| | |
|---|---|
| Route | `/chats` (`/inbound`, `/relay` deep-link in) |
| Views | `?view=` Needs reply · Waiting · Follow-ups · Meeting requests · Proposal requests · Closed |
| Components | `ChatQueueList`, `LeadConversation`, `ChatIntelligencePanel`, `IntelligenceDrawer` |
| Loaders | `chat-queue.ts` (`deriveConversationRow`, `chatViewMatches`, priority sort) |
| Data | `messages`, `conversation_states`, canonical analysed intent |
| Roles | all (manager views gated) |
| Status | code complete · `tests/v3/inbox-v3.test.ts` · live auth certification pending |

---

## 4. WORK

| | |
|---|---|
| Route | `/tasks` |
| Views | `?view=` Today (default) · Overdue · Upcoming · Completed · All |
| Components | `TaskWorkspaceView`, `TaskBoard`, `TaskDetailDrawer` |
| Loaders | unified task engine (`rank-unified-tasks`, `task-views`), `task_events` history |
| Roles | all |
| Status | code complete · `tests/v3-team-operations.test.ts` · live auth certification pending |

`/team/tasks` redirects here with `?scope=team`.

---

## 5. TEAM

| Surface | Route | Status |
|---|---|---|
| Overview | `/team` | code complete |
| People | `/team/people` | code complete |
| Workload | `/team/workload` | code complete |
| Activity | `/team/activity` | code complete |
| Performance | `/team/performance` | code complete (trend chart added) |
| Targets | `/team/targets` | code complete |
| Groups | `/team/groups`, `/team/groups/[teamId]` | code complete |
| Rep 360 | `/team/[repId]` | code complete (pipeline strip + heatmap added) |
| Daily Operations | `/admin/command` | code complete |

Loaders: `getPeopleDirectory`, `loadTimeline`, `buildTeamAttentionFromPeople`,
`buildWorkloadRows`, `getPerformance`, `getRepDailyActivity`, `loadTeamTrend`.
Roles: Manager+ (Rep 360 is scope-checked).

---

## 6. CONTENT

| Surface | Route | Status |
|---|---|---|
| Studio | `/content` | code complete — daily brief, recommended post, alternates, trend context, memory |
| Ideas | `/content/ideas` | code complete — URL-backed views + filters |
| Growth | `/content/growth` | code complete — admin/owner brand workspace |
| Draft | `/studio/drafts/new?personaId&ideaId` | code complete |
| Draft workspace | `/studio/drafts/[id]` | code complete |

Loaders: `getDailyContentBriefWithIdeas`, `listContentMemories`,
`listContentHistory`, `listTrendItems` + `rankTrendsForPersona`, growth brief.
Legacy `/content-v2/*` redirect to V3. Persona access: own + admin
(`canViewPersona`).

---

## 7. INSIGHTS

| Surface | Route |
|---|---|
| Sales Insights | `/reports/sales` |
| AI Usage | `/admin/ai-usage` |
| Revenue Intelligence | `/admin/revenue-intelligence` |

Legacy `/reports/pipeline`, `/reports/team`, `/reports/activity`,
`/reports/revenue` remain but are superseded.

---

## 8. SETTINGS / ADMIN

| Surface | Route | Roles |
|---|---|---|
| Settings | `/settings` | all |
| Command Center | `/admin/command` | Admin/Owner (managers via Team) |
| People & Roles | `/admin/people` | Admin/Owner |
| Profiles | `/profile-intelligence` | Admin/Owner |
| Scoring QA | `/admin/scoring-qa` | Admin/Owner |
| QA & Trust | `/admin/qa` | Admin/Owner |
| Dataset | `/admin/dataset` | Admin/Owner |
| Training Data | `/admin/training-data` | Admin/Owner |
| Manage Profiles | `/manage-profiles` | Owner |

---

## 9. Database / infrastructure

| Item | State |
|---|---|
| DB provider | `RELAY_DB_PROVIDER=neon` (adapter `lib/db/neon.ts`) |
| Auth provider | `RELAY_AUTH_PROVIDER=neon` (`lib/auth/neon-server.ts`) |
| Region | `vercel.json` → `sin1` (Singapore, beside Neon) |
| Aggregates | `lib/analytics/aggregates.ts` — performance, activity, team trend, pipeline stage |
| Egress | narrow list projections, bounded pipeline cards, SQL aggregates; no raw event transfer for analytics |
| RLS | Neon path relies on explicit org/scope checks in the store (`getLead`, `canOpenLead`) |
| Invitations | `pending_invitations` + provider-neutral invitations |

---

## 10. Live certification status

Live Neon Auth certification is **blocked on credentials**. The demo workspace
(`SCOUT_DB=demo`) signs in but cannot render Supabase-backed surfaces (Tasks,
Team, Rep 360, Ideas), which throw `Demo store does not support direct Supabase
access`. Those surfaces are verified by fixture, contract, typecheck, lint and
build — not by a real authenticated session.

| Surface | Fixture/contract | Live auth |
|---|---|---|
| Rep Home | pass | pending |
| Leads / Pipeline / Lead 360 | pass | pending |
| Inbox | pass | pending |
| Tasks / Team / Rep 360 / Performance | pass | pending |
| Studio / Ideas / Growth | pass | pending |
| Shell / navigation | pass | partial (demo mode) |

---

## 11. Known product gaps (open, not regressions)

These were found during reconciliation. They are **not** merge regressions and
are recorded so they are not mistaken for shipped behaviour.

1. **No canonical lead selector.** `AssignTaskDialog`
   (`src/components/tasks/assign-task-dialog.tsx`) attaches a lead through a
   free-text "Lead ID (optional)" input whose placeholder is "UUID if related to
   a lead". There is no server-side lead search API and no combobox. The dialog
   is pre-filled when opened from a lead context (`defaultLeadId`), so the gap is
   a fallback path, not the primary flow. Phase 29 of the reconciliation spec
   asks for a role-scoped selector searchable by person / company / title; that
   is new feature work and was not built in this reconciliation pass.
2. **`/leads/[id]` scope is enforced**, but other lead-adjacent routes (notes,
   tasks, outcomes) rely on the caller passing the scope; there is no single
   guard for every lead-scoped API route.
3. **`/admin/command` allows managers** while sibling admin routes do not —
   confirmed intentional (managers need Daily Operations).
4. **Landing page (`/`) accessibility** reports `aria-hidden-focus` and
   `color-contrast` failures. Pre-existing and outside the app shell's scope.
5. **Dead code.** The duplicate `src/components/app-rail.tsx` shell was removed
   in the shell sprint. In the November 4 stabilization pass a further **48
   provably unreachable files were deleted** (dead conversation/relationship/
   studio-v2 clusters, superseded dashboards, unused UI primitives); every
   removal, replacement and reference check is recorded in
   `RELAY_DEAD_CODE_REMOVAL_REPORT.md`. Assets flagged for reuse rather than
   deletion (sparkline, pipeline analytics view, team live board) are listed
   there too.

---

## STABILIZATION STATUS (2026-11-04)

**Branch:** `release-merge` · **SHA:** `a2983dd`

| Area | Status |
|---|---|
| Navigation | Canonical V3 shell (`relay-app-shell.tsx` + `relay-shell-nav.ts`). Exactly one active primary and one active secondary, enforced by tests. Every primary/secondary href resolves to a real route. |
| Role visibility | Nav items gated by `everyone` / `managerUp` / `adminUp` / `managerOnly`; `/facts` now uses the canonical product-admin check; `/team/eval` requires a manager. |
| Dead code | 48 files removed, evidence in `RELAY_DEAD_CODE_REMOVAL_REPORT.md`. |
| Filters | Leads sentinels fixed; Tasks filters are URL-backed on refresh; Rep 360 / Group `?view=overdue` honoured; Ideas tabs preserve filters. |
| Docs | 9 superseded/dead docs moved to `docs/archive/`; index re-written. |
| Dashboards | In progress — heatmap / trend blocks for Rep Home and Admin Home. |

**Known blockers / gaps**

1. Rep 360 (`/team/[repId]`) has no nav entry of its own; it is reached by
   clicking any person row from Team → People / Workload / Overview.
2. The Leads **Profile** select offers only "All profiles" / "No profile"; it
   cannot target a specific sending identity.
3. Pipeline (`/leads?view=pipeline`) does not apply the table's URL filters —
   its search and stage chips are client-side over the bounded card payload.
4. Compat-only redirect routes remain because `src/proxy.ts`, e2e suites and QA
   scripts reference them.
5. Playwright suites need live Neon credentials; they cannot run on this machine.

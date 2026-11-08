# Relay — Canonical Product Map (V4)

> Snapshot: **2026-11-09**, source SHA `3a3b7b4` (clean tree).
> This is the single current product map. It replaces the route-level inventory
> in `RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` (kept as a historical reference).
> Where this document and a code comment disagree, the code wins — open a fix.
>
> Evidence rule: every classification below was read from the page file, the nav
> config, or a runtime link. Reachability was checked with grep over
> `src/app`, `src/components`, `src/lib`, `tests` and `e2e`.

---

## 1. Domains (canonical IA)

The primary sidebar is the only domain navigation. It is declared in
`src/lib/navigation/relay-shell-nav.ts` (`NAV_DOMAINS`) and rendered by
`src/components/v4/v4-app-shell.tsx`.

| Domain | Route | Visible to | Secondary destinations |
|---|---|---|---|
| **Home** | `/dashboard` | everyone | — (cockpit) |
| **Sales** | `/leads` | everyone | Prospects `/prospect`, Leads `/leads`, Pipeline `/leads?view=pipeline`, Companies `/accounts` (manager+), Import `/leads/import`, Upwork `/upwork`, Email `/revenue/email` |
| **Inbox** | `/chats` | everyone | Needs reply `/chats?view=waiting_me`, Waiting `/chats?view=waiting_them`, Follow-ups `/chats?view=followups`, All `/chats?view=all` |
| **Work** | `/tasks` | everyone | My Tasks `/tasks`, Today `/tasks?view=today`, Overdue `/tasks?view=overdue`, Upcoming `/tasks?view=upcoming`, Completed `/tasks?view=completed`, Team Tasks `/tasks?scope=team` (manager+) |
| **Team** | `/team` | manager+ | Overview, People, Profiles, Identities, Coverage, Workload, Activity, Performance, Targets, Groups, Daily Operations (manager-only) |
| **Content** | `/content` | everyone | Studio `/content`, Ideas `/content/ideas`, Growth `/content/growth` (admin+) |
| **Insights** | `/reports/sales` | everyone | Sales, Pipeline, Team, Revenue, Activity |
| **Settings** | `/settings` | everyone | My Account `/settings`, Notifications `/notifications` |
| **Admin** | `/admin/command` | admin+ | Command Center, People & Roles, Targets, Scoring QA, QA & Trust, Fact Guardrails, Dataset, Training Data, AI Usage, Revenue Intelligence |

`PRIMARY_MAIN_IDS` = Home, Sales, Inbox, Work, Team, Content, Insights.
`PRIMARY_UTILITY_IDS` = Settings, Admin (below the sidebar divider).

Mobile bottom bar (5 slots): Home, Sales, Inbox, Work-or-Team, More.
The More sheet lists every remaining role-valid domain and its secondary items.

---

## 2. Route matrix

Legend: **KEEP** core · **KEEP** config · **REDIR** compatibility redirect ·
**DEAD** unreachable · **FIXTURE** QA-only.

### 2.1 Home / cockpit

| Path | File | Access | Purpose | Status | Loader / authority |
|---|---|---|---|---|---|
| `/dashboard` | `(app)/dashboard/page.tsx` | everyone | Role-branched cockpit: Rep Home, Manager Home, Admin Home | KEEP | `loadRepWorkspaceData`, `loadManagerHomeTeam`, `loadAdminCommandCenter` |
| `/home` | `(app)/home/page.tsx` | everyone | — | **REDIR** → `/dashboard` | — |
| `/activate` | `(app)/activate/page.tsx` | everyone | Onboarding intent setup | KEEP (onboarding) | static |
| `/onboarding` | `onboarding/page.tsx` | authed | Profile/identity bootstrap | KEEP | `createScoutStore` |

### 2.2 Sales

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/prospect` | `(app)/prospect/page.tsx` | everyone | Analyze a profile/source | KEEP | `/api/prospect/analyze`, `/api/prospect/save` |
| `/leads` | `(app)/leads/page.tsx` | everyone | Lead CRM (table) + Pipeline (board) | KEEP | `loadLeadsPage`, `loadBoardPreview` |
| `/leads/[id]` | `(app)/leads/[id]/page.tsx` | everyone (scoped) | Lead 360 | KEEP | `canOpenLead` |
| `/leads/import` | `(app)/leads/import/page.tsx` | everyone | CSV import | KEEP | `/api/leads/import` |
| `/leads/new` | `(app)/leads/new/page.tsx` | everyone | Manual lead + analyze | KEEP | `/api/leads/extract` |
| `/accounts` | `(app)/accounts/page.tsx` | manager+ (nav) | Companies | KEEP | `lib/operations/accounts.ts` |
| `/accounts/[company]` | `(app)/accounts/[company]/page.tsx` | everyone | Company 360 | KEEP | account overview |
| `/upwork` | `(app)/upwork/page.tsx` | everyone | Upwork jobs | KEEP | `store.listUpworkJobs` |
| `/upwork/[id]` | `(app)/upwork/[id]/page.tsx` | everyone | Job detail | KEEP | `store.getUpworkJob` |
| `/upwork/new` | `(app)/upwork/new/page.tsx` | everyone | Extract a job | KEEP | `/api/upwork/extract` |
| `/revenue/email` | `(app)/revenue/email/page.tsx` | everyone | Email workspace | KEEP | `/api/revenue/email` |
| `/archive` | `(app)/archive/page.tsx` | everyone | Conversation + archived-lead archive | KEEP | `loadConversationArchive` |

### 2.3 Inbox

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/chats` | `(app)/chats/page.tsx` | everyone | Canonical Inbox (queue/thread/intelligence) | KEEP | `loadChatQueue`, `loadChatIntelligence` |
| `/inbound` | `(app)/inbound/page.tsx` | everyone | Legacy inbound desk / log an inbound message | **REVIEW** | `loadInboundQueue` |
| `/relay` | `(app)/relay/page.tsx` | everyone | — | **REDIR** → `/chats` | — |
| `/relay/persona-daily` | `(app)/relay/persona-daily/page.tsx` | everyone | — | **REDIR** → `/content` | — |
| `/inbox-fixture` | `inbox-fixture/page.tsx` | public | Visual dev fixture (no DB) | **FIXTURE** | deterministic |

### 2.4 Work

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/tasks` | `(app)/tasks/page.tsx` | everyone | Unified task workspace | KEEP | `loadUnifiedTasks`, `classifyUnifiedTaskTab` |
| `/team/tasks` | `(app)/team/tasks/page.tsx` | manager+ | — | **REDIR** → `/tasks?scope=team` | — |

### 2.5 Team

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/team` | `(app)/team/page.tsx` | manager+ | Team overview | KEEP | `getPeopleDirectory`, `loadTimeline` |
| `/team/people` | `(app)/team/people/page.tsx` | manager+ | People directory | KEEP | `getPeopleDirectory` |
| `/team/profiles` | `(app)/team/profiles/page.tsx` | manager+ | Profile front door | KEEP | `lib/team/profiles.ts` |
| `/team/profiles/[profileId]` | `(app)/team/profiles/[profileId]/page.tsx` | manager+ | Profile detail | KEEP | `lib/team/profile-detail.ts` |
| `/profile-intelligence` | `(app)/profile-intelligence/page.tsx` | everyone (admin tab) | Identities (admin) / own profiles | KEEP | `ProfileIntelligenceDashboard` |
| `/profile-intelligence/[id]` | `(app)/profile-intelligence/[id]/page.tsx` | manager+ | — | **REDIR** → `/team/profiles/[id]` | — |
| `/team/coverage` | `(app)/team/coverage/page.tsx` | manager+ | Coverage lifecycle | KEEP | `lib/coverage/load.ts` |
| `/team/workload` | `(app)/team/workload/page.tsx` | manager+ | Open-work comparison | KEEP | `buildWorkloadRows` |
| `/team/activity` | `(app)/team/activity/page.tsx` | manager+ | Org activity feed | KEEP | `loadTimeline` |
| `/team/performance` | `(app)/team/performance/page.tsx` | manager+ | Execution/conversion/comparison | KEEP | `getPerformance` |
| `/team/targets` | `(app)/team/targets/page.tsx` | manager+ | Target progress | KEEP | `loadTargets` |
| `/team/groups` | `(app)/team/groups/page.tsx` | manager+ | Teams index | KEEP | `getPeopleDirectory` |
| `/team/groups/[teamId]` | `(app)/team/groups/[teamId]/page.tsx` | manager+ | Team detail | KEEP | group scope |
| `/team/[repId]` | `(app)/team/[repId]/page.tsx` | manager+ / self | Rep 360 | KEEP | `repInScope` |
| `/team/eval` | `(app)/team/eval/page.tsx` | manager+ | Evaluation harness | KEEP | `/api/eval/*` |
| `/manage-profiles` | `(app)/manage-profiles/page.tsx` | manager+ | — | **REDIR** → `/team/profiles` | — |
| `/profiles` | `(app)/profiles/page.tsx` | manager+ | — | **REDIR** → `/team/profiles` | — |
| `/accountability` | `(app)/accountability/page.tsx` | everyone | — | **REDIR** → `/dashboard` | — |
| `/admin/accountability` | `(app)/admin/accountability/page.tsx` | admin+ | — | **REDIR** → `/admin/command` | — |

### 2.6 Content

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/content` | `(app)/content/page.tsx` | everyone | Studio (daily brief, ideas) | KEEP | `getDailyContentBriefWithIdeas` |
| `/content/ideas` | `(app)/content/ideas/page.tsx` | everyone | Idea library | KEEP | `lib/content/ideas-v3.ts` |
| `/content/growth` | `(app)/content/growth/page.tsx` | admin+ | Brand growth/trends | KEEP | `rankTrendsForPersona` |
| `/content/new` | `(app)/content/new/page.tsx` | everyone | Create persona | KEEP | `/api/content/personas` |
| `/content/[id]` | `(app)/content/[id]/page.tsx` | owner/admin | — | **REDIR** → `/content?persona=id` | — |
| `/content-v2/[id]/today` | `(app)/content-v2/[id]/today/page.tsx` | owner/admin | — | **REDIR** → `/content?persona=id` | — |
| `/content-v2/growth` | `(app)/content-v2/growth/page.tsx` | admin+ | — | **REDIR** → `/content/growth` | — |
| `/admin/growth` | `(app)/admin/growth/page.tsx` | admin+ | — | **REDIR** → `/content/growth` | — |
| `/studio/drafts/[id]` | `studio/drafts/[id]/page.tsx` | authed | Post workspace | KEEP | `store.getContentDraft` |
| `/studio/drafts/new` | `studio/drafts/new/page.tsx` | authed | Post workspace (needs `personaId`) | **REVIEW** | `store.getContentPersona` |
| `/studio/post-detail` | `(app)/studio/post-detail/page.tsx` | everyone | — | **REDIR** → `/content` | — |

### 2.7 Insights

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/reports` | `(app)/reports/page.tsx` | everyone | — | **REDIR** → `/reports/sales` | — |
| `/reports/sales` | `(app)/reports/sales/page.tsx` | everyone | Sales report | KEEP | `loadSalesReport` |
| `/reports/pipeline` | `(app)/reports/pipeline/page.tsx` | everyone | Pipeline report | KEEP | `loadPipelineReport` |
| `/reports/team` | `(app)/reports/team/page.tsx` | manager+ | Team report | **DUPLICATE** of `/team/performance` | `getPerformance` |
| `/reports/revenue` | `(app)/reports/revenue/page.tsx` | everyone | Revenue outcomes | KEEP | `loadRevenueReport` |
| `/reports/activity` | `(app)/reports/activity/page.tsx` | everyone | Personal activity (managers → `/team/activity`) | KEEP | `loadTimeline` |
| `/performance` | `(app)/performance/page.tsx` | everyone | Personal consistency heatmap | KEEP | `getRepDailyActivity` |

### 2.8 Settings / account

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/settings` | `(app)/settings/page.tsx` | everyone | Account + preferences (+ admin hours) | KEEP | `loadOperatingPolicy` |
| `/notifications` | `(app)/notifications/page.tsx` | everyone | Notification center | KEEP | `/api/notifications` |
| `/account` | `(app)/account/page.tsx` | everyone | — | **REDIR** → `/settings` / `/accounts/[key]` | — |
| `/facts` | `(app)/facts/page.tsx` | everyone (edit admin) | Fact guardrails | KEEP | `/api/facts` |

### 2.9 Admin

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/admin` | `(app)/admin/page.tsx` | admin+ | — | **REDIR** → `/admin/command` | — |
| `/admin/command` | `(app)/admin/command/page.tsx` | manager+ | Command Center (today) | KEEP | `loadTeamDay` |
| `/admin/command/[repId]` | `(app)/admin/command/[repId]/page.tsx` | manager+ | Rep day detail | KEEP | `loadRepDayDetail` |
| `/admin/command-center` | `(app)/admin/command-center/page.tsx` | admin+ | — | **REDIR** → `/admin/command` | — |
| `/admin/people` | `(app)/admin/people/page.tsx` | admin+ | People & roles | KEEP | `PeopleView` |
| `/admin/targets` | `(app)/admin/targets/page.tsx` | admin+ | Target configuration | KEEP | `TargetsManager` |
| `/admin/scoring-qa` | `(app)/admin/scoring-qa/page.tsx` | admin+ | Scoring QA | KEEP | `ScoringQaCenter` |
| `/admin/qa` | `(app)/admin/qa/page.tsx` | admin+ (layout) | QA & Trust | KEEP | `/api/admin/qa-views` |
| `/admin/dataset` | `(app)/admin/dataset/page.tsx` | admin+ | Dataset | KEEP | `DatasetCenter` |
| `/admin/training-data` | `(app)/admin/training-data/page.tsx` | admin+ | Training data | KEEP | `TrainingDataCenter` |
| `/admin/ai-usage` | `(app)/admin/ai-usage/page.tsx` | admin+ | AI usage | KEEP | `/api/admin/ai-usage` |
| `/admin/revenue-intelligence` | `(app)/admin/revenue-intelligence/page.tsx` | admin+ | Revenue intelligence | KEEP | `RevenueIntelligenceDashboard` |
| `/admin/revenue-identities` | `(app)/admin/revenue-identities/page.tsx` | admin+ | — | **REDIR** → `/profile-intelligence?tab=identities` | — |
| `/admin/activity` | `(app)/admin/activity/page.tsx` | admin+ | — | **REDIR** → `/reports/activity` | — |

### 2.10 Workspace

| Path | File | Access | Purpose | Status | Loader |
|---|---|---|---|---|---|
| `/workspace/[revenueIdentityId]` | `(app)/workspace/[revenueIdentityId]/page.tsx` | authorized / admin | Profile-scoped workspace | KEEP | `listMyWorkableIdentities` |
| `/qa-v4` | `(app)/qa-v4/page.tsx` | fixture-gated | V4 QA fixture | **FIXTURE** | deterministic |

### 2.11 Public

`/login` · `/signup` · `/forgot-password` · `/reset-password` · `/verify-email` ·
`/` (landing) · `/pricing` · `/docs` (+ 18 doc pages) · `/privacy` · `/terms` ·
`/security` · `/trust` · `/acceptable-use` · `/ai-policy`.

---

## 3. Role matrix

Canonical role source: `organization_roles` (`src/lib/auth/organization.ts`).
`reps.role` is only a bootstrap fallback and must never escalate a demoted user.

| Capability | REP | MANAGER | ADMIN | OWNER |
|---|---|---|---|---|
| Home cockpit | ✅ own | ✅ personal + team | ✅ org command | ✅ org command |
| Sales (prospect/leads/pipeline/import/upwork/email) | ✅ own scope | ✅ team scope | ✅ org | ✅ org |
| Companies (`/accounts`) | ❌ | ✅ | ✅ | ✅ |
| Inbox | ✅ own executable profiles | ✅ team | ✅ org | ✅ org |
| Work (tasks) | ✅ own | ✅ team | ✅ org | ✅ org |
| Team domain | ❌ | ✅ managed teams | ✅ org | ✅ org |
| Profiles / coverage / targets (read) | ❌ | ✅ | ✅ | ✅ |
| Targets (edit) | ❌ | ❌ | ✅ | ✅ |
| People & roles / invite | ❌ | ❌ | ✅ | ✅ |
| Content Studio | ✅ own personas | ✅ own | ✅ own | ✅ own |
| Content Growth | ❌ | ❌ | ✅ | ✅ |
| Insights | ✅ own | ✅ team | ✅ org | ✅ org |
| Settings / notifications | ✅ | ✅ | ✅ | ✅ |
| Admin domain | ❌ | ❌ | ✅ | ✅ |
| Command Center | ❌ | ✅ (as Team → Daily Operations) | ✅ (as Admin → Command Center) | ✅ |

Manager is `OWNER`/`ADMIN` or a `MANAGER` team membership. Admin is
`OWNER`/`ADMIN`. `isProductAdmin` = `isOwner || isAdmin`, never `reps.role`.

---

## 4. Canonical data authorities

| Number | Canonical authority | Consumers | Divergent implementations |
|---|---|---|---|
| Needs reply | `getInboxCountsForRep` → `loadChatQueue` → `deriveConversationRow` | Rep Home, `/chats` | `sidebar-counts.countInboxNeedsReply` (SQL predicate), `getDailyWorkspace` (`status='replied'`), `assembleManagerHomeTeamData` fallback (`status='replied'`), `loadRepDayDetail` (`status='replied'`), `coverage/load.ts` (`status='replied'`) |
| Waiting on client | `loadChatQueue.counts.waiting_them` | Rep Home, `/chats` | — |
| Follow-ups | `loadChatQueue.counts.followups` | Rep Home, `/chats` | `followUpsOverdue` (`status in contacted/followed_up`), `loadRepDayDetail` (hardcoded `0`) |
| Assigned tasks | `loadUnifiedTasks` + `selectAssignedOpenTasks` | Rep Home, `/tasks` | `sidebar-counts.countActionableTasks` (SQL `assigned_tasks` only) |
| Active work | `loadUnifiedTasks` + `classifyUnifiedTaskTab` (`today`/`overdue`) | `/tasks` | `sidebar-counts.countActionableTasks` |
| Daily target | `getDailyWorkspace.targetSummary` / `loadTargets` | Rep Home, Team Targets | — |
| Coverage | `lib/coverage/load.ts` | Rep Home, Team Coverage, Admin Home | — |
| Profile ownership | `profile_coverage` (PRIMARY) + `coverage_assignments` (ACTIVE) | Team Profiles, `/tasks` enrichment | — |
| Pipeline counts | `loadBoardPreview` / `loadFilteredBoard` | `/leads?view=pipeline` | — |
| Meetings / wins | `loadOutcomeEventCounts` / `countOutcomeEventsToday` | Rep Home, Manager Home, Admin Home, Team Performance | — |
| Activity timeline | `loadTimeline` | Rep Home, Team Activity, Reports | — |
| Inbox navigation | `lib/navigation/inbox-nav.ts` | shell, `/chats`, palette, breadcrumb | — |
| Global create | `lib/navigation/global-create-items.ts` | header menu, palette | — |

---

## 5. Duplicates, dead routes and dead components

### 5.1 Duplicate surfaces

| Surface | Canonical | Duplicate | Evidence |
|---|---|---|---|
| Team performance | `/team/performance` | `/reports/team` | same `getPerformance` loader + `RepComparison` component; reports page is a strict subset |
| Inbox | `/chats` | `/inbound` | separate queue loader + desk; reachable only from palette/archive |
| Content studio | `/content` | `/content-v2/[id]/today`, `/content/[id]` | redirects |
| Growth | `/content/growth` | `/content-v2/growth`, `/admin/growth` | redirects |
| Profiles | `/team/profiles` | `/profiles`, `/manage-profiles`, `/profile-intelligence/[id]` | redirects |
| Identities | `/profile-intelligence?tab=identities` | `/admin/revenue-identities` | redirect |
| Command Center | `/admin/command` | `/admin/command-center` | redirect |

### 5.2 Dead components (zero imports across `src/app`, `src/lib`, `src/components`, `tests`)

| File | Lines |
|---|---|
| `src/components/dashboard/rep-dashboard.tsx` | 10 |
| `src/components/manager/manager-home-view.tsx` | 424 |
| `src/components/manage-profiles.tsx` | 774 |
| `src/components/profiles-manager.tsx` | 764 |
| `src/components/dashboard/analytics/pipeline-analytics-view.tsx` | 573 |
| `src/components/admin/team-live-board.tsx` | 177 |
| `src/components/signal/signal-feed.tsx` | 136 |
| `src/components/app-back-button.tsx` | 50 |
| `src/components/ui/action-line.tsx` | — |
| `src/components/ui/avatar.tsx` | — |
| `src/components/ui/breadcrumb.tsx` | — |
| `src/components/ui/inline-notice.tsx` | — |
| `src/components/ui/intelligent-empty-state.tsx` | — |
| `src/components/ui/page-shell.tsx` | — |
| `src/components/ui/sparkline.tsx` | — |
| `src/components/ui/switch.tsx` | — |

Total: **16 files, ~3,388 lines**, all with zero imports across `src/app`,
`src/lib`, `src/components` and `tests`.

### 5.3 Dead / legacy API families

`/api/content/intelligence/{discover,forge,interview,org-themes}` (superseded by
`v2`), `/api/growth/{decision,draft,memory,publications,today}` (v1),
`/api/profile-intelligence/legacy/classify`, `/api/profile-intelligence/profiles/[id]/sources` (410),
`/api/relay/persona-daily` (page and API both unreferenced).

---

## 6. Key workflows

### Rep
Login → `/dashboard` (Today) → profile switch → Do this next → `/leads/[id]` or
`/upwork/[id]` → `/chats?view=waiting_me` → `/tasks` → `/content` → `/reports/sales`.

### Manager
Login → `/dashboard` (Manager Home) → `/team` → People / Profiles / Coverage /
Workload / Activity / Performance / Targets → `/tasks?scope=team` → `/chats` →
`/admin/command` (Daily Operations).

### Admin
Login → `/dashboard` (Admin Home) → `/admin/command` → `/admin/people` /
`/admin/targets` / `/admin/scoring-qa` / `/admin/qa` / `/admin/dataset` /
`/admin/training-data` / `/admin/ai-usage` / `/admin/revenue-intelligence` →
`/team/profiles` / `/team/coverage` → `/content/growth`.

### Sales
`/prospect` → analyze → save lead → `/leads` → work lead → `/chats?lead=` →
outcome → `/reports/sales`.

### Coverage
Rep working → unavailable → affected profiles detected → backup recommended →
admin approves (`/team/coverage`) → temporary access → profile-bound tasks move →
primary returns → admin manually restores → completed work stays attributed.

---

## 7. Compat redirects (keep resolving)

`/home` · `/profiles` · `/manage-profiles` · `/profile-intelligence/[id]` ·
`/relay` · `/relay/persona-daily` · `/rep/assigned-profiles` · `/team/tasks` ·
`/accountability` · `/admin/accountability` · `/admin/command-center` ·
`/admin/activity` · `/admin/growth` · `/admin/revenue-identities` ·
`/content/[id]` · `/content-v2/[id]/today` · `/content-v2/growth` ·
`/studio/post-detail` · `/account` · `/reports`.

---

## 8. Open structural issues (evidence in §4)

1. **Five implementations of "replies waiting"** — only two use the canonical
   `deriveConversationRow`. The sidebar badge, `/api/me/workspace`, the manager
   home fallback and the rep-day detail all use `status = 'replied'`.
2. **Sidebar Work badge** uses a SQL `assigned_tasks` predicate; `/tasks` uses
   `loadUnifiedTasks` + `classifyUnifiedTaskTab`. Neither the scope nor the
   predicate match.
3. **`/tasks` scopes derived actions to the active workspace; `/dashboard` does
   not.** The same task can appear on one surface and not the other.
4. **`loadRepDayDetail.followUpsDue` is hardcoded `0`.**
5. **`/reports/team` duplicates `/team/performance`.**
6. **`/studio/drafts/new` is linked from Cmd-K without a `personaId`**, so it
   always redirects to `/content`.
7. **Eight dead components** (~2,900 lines).
8. **`/inbound` is a second Inbox** with its own loader and no nav entry.

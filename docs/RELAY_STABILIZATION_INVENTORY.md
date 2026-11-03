# RELAY STABILIZATION INVENTORY

**Status:** Phase 1 complete. No code has been modified. Nothing has been deleted.
**Rule:** `UNKNOWN` must reach zero before any deletion (Absolute Rule 1).
**Method:** static route/layout/component scan + import-graph verification (`grep`/ripgrep over `src`, `tests`, `scripts`). Runtime crawl pending (Phase 37).

Classification vocabulary:

| Code | Meaning |
|---|---|
| `KEEP` | Live and correct. Leave as-is. |
| `KEEP_AND_REUSE` | Good implementation; other surfaces should adopt it instead of their own copy. |
| `MERGE` | Duplicate of another surface; collapse to one canonical route/component. |
| `REDIRECT` | Keep the URL, serve a redirect to the canonical route. |
| `DEPRECATE` | Still linked somewhere; stop linking, redirect next. |
| `DELETE` | Proven unreachable AND no consumer. Requires full reference search first. |
| `INTERNAL_ONLY` | Not user-facing navigation; machine/deep-link entry (email links, notifications, scheduler). |
| `UNKNOWN` | Insufficient evidence. **Blocks deletion.** |

---

## 0. Live vs dead navigation chrome

The shell that actually renders is **`src/components/shell/relay-app-shell.tsx`**, mounted at `src/app/(app)/layout.tsx:98`.

### LIVE

| Surface | Source | File:line |
|---|---|---|
| Desktop left sidebar | `v3SidebarItems()` | `src/lib/navigation/relay-shell-nav.ts:228-247` |
| Mobile bottom nav | `v3MobileNavItems()` | `src/lib/navigation/relay-shell-nav.ts:208-219` |
| Section detection | `detectRelayShellSection()` | `src/lib/navigation/relay-shell-nav.ts:127-145` |
| Active item resolution | `resolveV3SidebarActiveId()` | `src/lib/navigation/relay-shell-nav.ts:250-271` |
| Command palette | `command-palette.tsx` (+ `search-shared.ts`) | `src/components/command-palette.tsx` |
| Global Create menu | `buildGlobalCreateItems()` → `global-create-menu.tsx` | `src/lib/navigation/global-create-items.ts:10-20` |
| Notification bell | → `/notifications` | `src/components/notification-center.tsx:144` |
| Profile switcher | → `/profile-intelligence?tab=identities` (admin) | `src/components/shell/profile-switcher.tsx:95` |
| Back button parents | `app-back-button.tsx` | `src/components/app-back-button.tsx:7-16` |
| Studio tabs (legacy content pages only) | `NAV_ITEMS` | `src/components/studio-layout.tsx:13-19` |
| Docs sidebar | `DOC_SECTIONS` | `src/app/(public)/docs/layout.tsx:6-24` |
| Admin dashboard quick actions | `v3-command-present.ts:188-205` | via `AdminCommandCenterView` at `/dashboard` |

### DEAD (no runtime consumer)

| Item | Evidence |
|---|---|
| `src/components/app-rail.tsx` (`PRIMARY_NAV`, `REP_NAV`, `TEAM_NAV`, `STUDIO_NAV`, `MORE_NAV`) | Zero component imports. Only `tests/relay-ux-2026-10-25.test.ts:78` and `tests/relay-regression-corpus.test.ts:197` read it. |
| `RELAY_TOP_NAV` | Exported, never consumed by a component. |
| `RELAY_SECTION_NAV` | Same. |
| `visibleTopNav()` | Only `tests/operations-workspace.test.ts:52,264` and `tests/relay-shell-nav.test.ts`. |
| `sectionNavItems()` | Tests only. |
| `resolveSectionActiveItem()` | Zero references outside its own module. |

> Consequence: **the running app's IA is the V3 sidebar.** Anything listed only in
> `app-rail.tsx` or `RELAY_TOP_NAV`/`RELAY_SECTION_NAV` is *not* in the product today,
> even though it looks configured. This is the single largest source of
> "hidden functionality" in Relay.

### Live navigation labels (actual)

Sidebar: Home `/dashboard` · Sales `/leads` · Inbox `/chats` · Tasks `/tasks` ·
Team `/team` (mgr+) · Insights `/reports` → `/reports/sales` · Admin `/admin` → `/admin/command` · Settings `/settings`

Mobile: Home · Leads · Inbox · Team (mgr+) · Reports

Command palette groups: Admin (admin+), plus manager-gated `create-task`, `team`,
`team-tasks`, `team-activity`, `team-performance` (`search-shared.ts:22-36`).

Global Create: Analyze Prospect `/prospect` · Add Lead `/prospect?tab=saved` ·
Create Task `/tasks` · Invite Person `/admin/people` (admin).

---

## 1. Layout inventory

| Layout | Chrome rendered |
|---|---|
| `src/app/layout.tsx` | Root html/body, fonts, `Providers`, theme bootstrap. No nav. |
| `src/app/(landing)/layout.tsx:11-19` | `LandingNav` + `MarketingFooter`. |
| `src/app/(public)/layout.tsx:6-14` | `MarketingNav` + `MarketingFooter`. |
| `src/app/(public)/docs/layout.tsx:26-85` | Docs sidebar (desktop) + `<details>` nav (mobile) + "Back to Relay". |
| `src/app/(app)/layout.tsx:22-114` | Auth gate, `AnalyticsProvider`, `AppIdentifyWrapper`, `ActiveIdentityProvider`, **`RelayAppShell`**. |
| `src/app/(app)/admin/qa/layout.tsx:3-6` | `requireProductAdmin()` only. |

---

## 2. Route inventory

Reachability key: **SIDEBAR** · **MOBILE** · **PAL** (command palette) · **CREATE** ·
**BELL** · **PROFILE** · **BACK** · **STUDIO** · **DOCS** · **FOOTER** · **LANDING** ·
**AUTH** · **ADMINHOME** · **ONB** · **INAPP** · **NONE**.

### 2.1 Public / marketing / docs

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/` | Marketing landing | LANDING, FOOTER | `KEEP` | |
| `/login` | Sign in | LANDING | `KEEP` | redirects if authed |
| `/signup` | Account creation | LANDING | `KEEP` | |
| `/forgot-password` | Reset request | AUTH | `KEEP` | |
| `/reset-password` | Set new password | AUTH | `KEEP` | |
| `/verify-email` | Verification landing | email link only | `INTERNAL_ONLY` | no nav entry — correct |
| `/pricing` | Plans | LANDING | `KEEP` | |
| `/trust`, `/privacy`, `/terms`, `/security`, `/acceptable-use` | Legal/trust | FOOTER | `KEEP` | |
| `/ai-policy` | AI usage policy | INAPP cross-links only | `KEEP` | **discoverability gap**: absent from footer/nav |
| `/docs` + 18 subpages | Product docs | DOCS | `KEEP` | no `docs/README.md` index |

### 2.2 App core

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/onboarding` | Post-signup setup | redirect target, ONB | `KEEP` | |
| `/dashboard` | Role home (rep/mgr/admin) | SIDEBAR, MOBILE, PAL | `KEEP` | renders `RepDashboard` / `ManagerHomeView` / `AdminCommandCenterView` |
| `/home` | Alias redirect → `/dashboard` | NONE | `REDIRECT` | only referenced by dead `RELAY_TOP_NAV` |
| `/leads` | Lead CRM table + pipeline board | SIDEBAR, MOBILE, PAL | `KEEP` | |
| `/leads/[id]` | Lead workspace | BACK, INAPP | `KEEP` | **no ownership/scope check** beyond existence (`page.tsx:19-24`) — security follow-up |
| `/leads/new` | Manual lead entry | PAL, INAPP | `KEEP` | |
| `/leads/import` | Bulk CSV import | NONE | `KEEP` | **hidden** — add to Sales secondary nav |
| `/chats` | Conversation inbox | SIDEBAR, MOBILE, PAL | `KEEP` | |
| `/prospect` | Prospect workspace | CREATE, PAL | `KEEP` | |
| `/relay` | Legacy prioritized queue | NONE | `DEPRECATE` | inbound only from dead `RelayTodayWorkspace` |
| `/relay/persona-daily` | Persona daily post generator | NONE | `DEPRECATE` | 0 UI refs; API `/api/relay/persona-daily` still used → redirect, keep API |
| `/inbound` | Inbound message desk | PAL, INAPP | `KEEP` | fold under Inbox |
| `/tasks` | Unified task workspace | SIDEBAR, PAL, CREATE | `KEEP` | |
| `/archive` | Conversation archive | PAL, INAPP | `KEEP` | |
| `/upwork` | Upwork job list | PAL, INAPP | `KEEP` | **not in sidebar** |
| `/upwork/new` | Extract/save job | PAL, INAPP | `KEEP` | |
| `/upwork/[id]` | Job detail + proposals | BACK, INAPP | `KEEP` | |

### 2.3 Studio / content

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/content` | Studio entry → persona today | PAL, INAPP | `KEEP` | |
| `/content/new` | Create content identity | INAPP, ONB | `KEEP` | |
| `/content/[id]` | Legacy persona redirect | INAPP | `REDIRECT` | → `/content-v2/[id]/today` |
| `/content/[id]/today` | Legacy redirect | INAPP API redirect | `REDIRECT` | |
| `/content/[id]/create` | Legacy quick capture | STUDIO tab | `DEPRECATE` | redirect to v2 |
| `/content/[id]/journey` | Legacy journey | STUDIO tab | `DEPRECATE` | |
| `/content/[id]/library` | Legacy library | STUDIO tab | `DEPRECATE` | |
| `/content/[id]/identity` | Legacy identity | STUDIO tab | `DEPRECATE` | |
| `/content-v2/growth` | Admin growth engine | PAL | `KEEP` | duplicates `/admin/growth`; gate uses raw `reps.role` not `authCtx` |
| `/content-v2/[id]/today` | Canonical Studio workspace | INAPP | `KEEP` | **must be exposed under Content → Studio** |
| `/studio/post-detail` | Post editor | INAPP | `KEEP` | |
| `/studio/drafts/new` | New draft | NONE | `DEPRECATE` | 0 refs; requires `?personaId=`; creation flows use `/studio/drafts/[id]` |
| `/studio/drafts/[id]` | Draft workspace | notification hrefs | `INTERNAL_ONLY` | |

### 2.4 Team

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/team` | People directory / workload | SIDEBAR, MOBILE, PAL, ADMINHOME | `KEEP` | |
| `/team/[repId]` | Rep 360 | BACK, INAPP | `KEEP` | |
| `/team/groups` | Teams index | breadcrumb only | `KEEP` | hidden — expose under Team |
| `/team/groups/[teamId]` | Team detail | INAPP | `KEEP` | |
| `/team/performance` | Team execution/comparison | PAL | `KEEP` | duplicates `/reports/team` |
| `/team/activity` | Org activity feed | PAL, INAPP | `KEEP` | duplicates `/reports/activity` |
| `/team/tasks` | Assigned work by rep | PAL | `KEEP` | |
| `/team/targets` | Target progress | NONE | `KEEP` | **hidden** — expose under Team |
| `/team/eval` | Eval harness / golden set | INAPP | `INTERNAL_ONLY` | QA surface, not product nav |

### 2.5 Reports / performance / accountability

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/reports` | Redirect → `/reports/sales` | SIDEBAR "Insights" | `REDIRECT` | |
| `/reports/sales` | Cohort progression + execution | SIDEBAR, MOBILE, PAL | `KEEP` | |
| `/reports/pipeline` | Pipeline by stage | NONE | `MERGE` | duplicate of `/leads?view=pipeline` + `/team/performance` |
| `/reports/team` | Execution per rep | NONE | `MERGE` | duplicate of `/team/performance` |
| `/reports/activity` | Rep activity timeline | INAPP | `MERGE` | duplicate of `/team/activity` |
| `/reports/revenue` | Won/lost outcomes | NONE | `MERGE` | duplicates `/admin/revenue-intelligence` |
| `/performance` | Personal heatmap | INAPP | `KEEP` | rep surface |
| `/accountability` | Rep daily numbers | NONE | `MERGE` | duplicate of `/performance` + `/admin/command/[repId]` |
| `/notifications` | Notification center | BELL | `KEEP` | |
| `/settings` | Account / send budget / admin panels | SIDEBAR, PAL | `KEEP` | |
| `/account` | Legacy redirect | NONE | `REDIRECT` | |
| `/activate` | Activation intent picker | ONB | `DEPRECATE` | onboarding-only, no live entry |

### 2.6 Accounts / profiles / workspace

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/accounts` | Companies list | PAL (admin) | `KEEP` | |
| `/accounts/[company]` | Account 360 | INAPP | `KEEP` | |
| `/manage-profiles` | Central profile directory | ONB, ADMINHOME | `KEEP` | hidden from sidebar |
| `/facts` | Approved fact guardrails | PAL | `KEEP` | |
| `/profile-intelligence` | People + sending identities | PAL, PROFILE | `KEEP` | |
| `/profile-intelligence/[id]` | Profile detail | BACK, INAPP | `KEEP` | |
| `/profiles` | Legacy profile manager | PAL | `MERGE` | duplicate of `/profile-intelligence` |
| `/workspace/[revenueIdentityId]` | Responsibility workspace detail | NONE (inbound from dead components) | `KEEP` | IA V2:154 KEEP — needs a live entry point |
| `/rep/assigned-profiles` | Assigned profiles view | PAL, notification | `KEEP` | |
| `/revenue/email` | Email send workspace | orphan chain only | `KEEP` | IA V2:166 MOVE — relocate under Sales/Email |

### 2.7 Admin

| Route | Purpose | Reachability | Class | Notes |
|---|---|---|---|---|
| `/admin` | Redirect → `/admin/command` | SIDEBAR "Admin" | `REDIRECT` | |
| `/admin/command` | Daily operations command centre | PAL, ADMINHOME, settings | `KEEP` | admin **or manager** |
| `/admin/command-center` | Redirect → `/admin/command` | `/admin`, scheduler | `REDIRECT` | |
| `/admin/command/[repId]` | Single rep day detail | INAPP | `KEEP` | |
| `/admin/people` | Org hierarchy / roles / teams | PAL, CREATE, ADMINHOME | `KEEP` | |
| `/admin/ai-usage` | AI spend/failures/latency | settings, ADMINHOME | `KEEP` | hidden from sidebar — expose under Insights |
| `/admin/scoring-qa` | Scoring QA monitor | NONE | `KEEP` | **hidden** — expose under Admin |
| `/admin/qa` | Routing/staleness/thread review | NONE | `KEEP` | **hidden** — expose under Admin |
| `/admin/dataset` | Dataset center | NONE | `KEEP` | **hidden** — expose under Admin |
| `/admin/training-data` | Training data center | NONE | `KEEP` | **hidden** — expose under Admin |
| `/admin/targets` | Manage daily targets | PAL, ADMINHOME | `KEEP` | |
| `/admin/revenue-intelligence` | Revenue analytics | PAL, INAPP | `KEEP` | |
| `/admin/revenue-identities` | Redirect → `/profile-intelligence?tab=identities` | notification hrefs | `REDIRECT` | |
| `/admin/growth` | Growth dashboard | NONE | `MERGE` | duplicate of `/content-v2/growth`; mixed gate |
| `/admin/accountability` | Redirect → `/admin/command` | redirect target | `REDIRECT` | |
| `/admin/activity` | Redirect → `/admin/command` | NONE | `REDIRECT` | |

---

## 3. Hidden functionality (must be exposed, not deleted)

**Resolved in Phase 4** — every route below now has a navigation entry point.
Final mapping: `docs/RELAY_ERP_NAVIGATION.md`.

| Route | Feature | New home |
|---|---|---|
| `/leads/import` | Bulk CSV import | Sales → Import Leads |
| `/upwork`, `/upwork/new` | Upwork jobs & proposals | Sales → Upwork (+ Create) |
| `/team/targets` | Target progress | Team → Targets |
| `/team/groups` | Teams index | Team → Groups |
| `/admin/scoring-qa` | Scoring QA | Admin → Scoring QA |
| `/admin/qa` | QA & trust | Admin → QA & Trust |
| `/admin/dataset` | Dataset center | Admin → Dataset |
| `/admin/training-data` | Training data | Admin → Training Data |
| `/admin/ai-usage` | AI usage | Insights → AI Usage |
| `/manage-profiles` | Profile directory | Admin → Manage Profiles (owner) |
| `/content-v2/[id]/today` | Canonical Studio workspace | Content → Studio |
| `/content-v2/growth` | Growth engine | Content → Growth |
| `/revenue/email` | Email workspace | Sales → Email |
| `/ai-policy` | AI usage policy | Still absent from the public footer — tracked separately |

---

## 4. UNKNOWN register — RESOLVED (zero open)

All items below were `UNKNOWN` at first pass; each is now resolved with evidence from
the existing audit trail (`docs/RELAY_INFORMATION_ARCHITECTURE_V2.md`,
`docs/RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md`, `docs/RELAY_PRODUCT_SIMPLIFICATION_PLAN.md`)
and fresh reference searches. **No item remains unclassified.**

| Item | Resolution | Evidence |
|---|---|---|
| `/relay/persona-daily` | `DEPRECATE` → redirect to `/content`; keep `/api/relay/persona-daily` | 0 UI refs; API still used by `persona-daily-post.tsx:45`; IA V2:162 DEPRECATE; QA audit lists it as a crawl target |
| `/studio/drafts/new` | `DEPRECATE` → redirect to `/content` | 0 refs; creation flows push to `/studio/drafts/[id]`; IA V2:185 DEPRECATE; route map:552 "Dead" |
| `/workspace/[revenueIdentityId]` | `KEEP` + expose under Accounts/Admin | IA V2:154 KEEP ("Accounts → identity workspace"); 3 refs all from dead rep components — needs a live entry point, not deletion |
| `/revenue/email` | `KEEP` + relocate under Sales/Email | IA V2:166 MOVE; 1 ref via orphan chain; component renders fine |
| `/team/groups` index | `KEEP` + expose under Team | reachable only via breadcrumb; real data |
| `/activate` | `DEPRECATE` after onboarding | onboarding-only (`ONB:264`); no live product entry |
| `src/components/rep/*` dead set | See §6 component inventory | type-only imports keep several modules alive; UI bodies are dead |

**Open decisions requiring owner input (not classification gaps):**

1. Should `/relay/persona-daily` be *exposed* under Content instead of deprecated? It has a working API and generator.
2. Should `/workspace/[revenueIdentityId]` become a real Accounts surface or stay admin-only?
3. `/admin/command` allows managers while sibling admin routes do not — intended?

---

## 6. Component & duplicate inventory

Full evidence in `docs/RELAY_COMPONENT_QUALITY_AUDIT.md`.

### 6.1 Same destination, different labels (Phase 4/40 input)

| Destination | Labels in the wild |
|---|---|
| `/chats` | Conversations, Inbox, Chats, Open conversations |
| `/leads` | Sales, Leads, Pipeline, Find leads |
| `/reports` | Reports, Insights |
| `/content` | Content, Studio, Quick Capture, Create Studio idea |
| `/team` | Team, People, My Team, Open Team |
| `/tasks` | Tasks, My tasks, Overdue tasks, Create task |
| `/admin/command` | Daily operations, Command, Command Center |
| `/admin/scoring-qa` | Intelligence, Scoring QA |
| `/profile-intelligence` | Profiles & identities, Profiles, Search profile, Sending identities |
| `/content-v2/growth` | Growth, Relay Growth |
| `/admin/people` | Access & roles, People |
| `/admin/revenue-intelligence` | Revenue, Revenue Intelligence |
| `/upwork` | Upwork, Jobs, Find jobs, Add Upwork job |
| `/prospect` | Prospects, Prospect, Analyze prospect, Analyze Prospect |

**Same href declared twice in one list:** `RELAY_SECTION_NAV.sales` declares both `Leads` and `Pipeline` at `/leads` (`relay-shell-nav.ts:69-70`); `resolveSectionActiveItem` (`:194`) exists solely to stop both lighting up. `/facts` appears in both `accounts` (`:85`) and `content` (`:106`). `/tasks` appears in both `home` (`:65`) and `sales` (`:72`).

**Landing nav vs marketing nav are byte-identical lists** (`landing-nav.tsx:9` vs `marketing-nav.tsx:9`), both live.

### 6.2 Duplicate component implementations

| Concept | Implementations | Canonical |
|---|---|---|
| KPI / metric card | `admin-primitives.MetricCard` (dead), `growth-dashboard.tsx:185`, `manager-home-view.tsx:390`, `leads-board-v2.tsx:444` `StatCard`, `performance/page.tsx:98` `StatCard`, `v3/primitives.V3Metric`, `ops-primitives.MetricStrip`, `dashboard/kit.StatTile` (62 refs) | `StatTile` + `V3Metric` |
| Page header | `ui/page-header.PageHeader` (40 refs), `ui/page-header.SectionHeader` (dead), `sales/sales-header` (8), `v3/primitives.V3PageHeader` (4), `admin-primitives.AdminPageHeader` (dead), `dashboard/kit.DashHeader` (24), `ui/page-shell.PageShell` (orphan) | `PageHeader` + `DashHeader` |
| Pipeline / stage visual | `v3/primitives.V3StageStrip`, `sales/lead-stage-strip`, `pipeline-analytics-view.StageBars` (dead), `revenue-intelligence-dashboard.StageBars`, `operations/performance-views.FunnelTable`, `lib/team/admin-command-summary.buildPipelineHealth` | `LeadStageStrip` (record) + revived `StageBars` (aggregate) |
| Empty state | `ui/empty-state.EmptyState` (32 refs), `.OnboardingGuide` (dead), `ui/intelligent-empty-state.IntelligentEmptyState`, `ui/intelligent-empty-state.repHomeEmptyState`, `v3/primitives.V3EmptyState`, `dashboard/kit.EmptyNote` (45 refs), `ops-primitives.InlineEmpty`, `conversation-waiting-state.ConversationEmptyState`, `leads/pipeline-utils.resolvePipelineEmptyState` | `EmptyState` + `V3EmptyState` |
| Progress ring | `score-ring.tsx` (live, a11y), `app-rail.tsx:269-292`, `relay-app-shell.tsx:110-133`, `rep-today.tsx:327-346` (dead) | one shared ring |
| Progress bar | `ui/progress.tsx`, `admin-primitives.ProgressBar` (dead), `dashboard/kit.Meter` (a11y), `rep-day-panel.tsx:130` (dead, a11y) | `Meter` |
| Funnel | dead `pipeline-analytics-view.tsx:268-296`, live `revenue-intelligence-dashboard.tsx:196-226`, live `operations/performance-views.tsx:14-60` | merge visual + ARIA |
| Team stacked bar | `rep/team-view.tsx:92-105`, `manager-team-view.tsx:78-91`, `admin/team-live-board.tsx:97-133` (all dead) | `TeamLiveBoard` pattern |
| Trend chart | dead `pipeline-analytics-view.tsx:211-230`, live `revenue-intelligence-dashboard.tsx:228-265` | revive dead one |
| Overlay | `ui/drawer.Drawer`, `ui/dialog.Dialog`, native `<dialog>` in `admin/invite-person-dialog.tsx` (orphan), custom `role="dialog"` in `jobs-search-client.tsx` (orphan) + `leads-table.tsx:347` | `Drawer` + `Dialog` |
| Tabs | `ui/tabs.Tabs`, `ui/tabs.TabContent` (dead), `ops-primitives.LinkTabs`, inline `role="tablist"` in 6 files | `Tabs` + `LinkTabs` |
| Toast | `ui/toast.ToastProvider` mounted (`providers.tsx:45`), `useToast` **dead**; driven by module singleton `lib/ui/notify.ts:14` | keep provider, revive `useToast` or delete it |

### 6.3 Duplicate loaders / queries

| Data | Implementations | Canonical |
|---|---|---|
| Pipeline stage counts | `store/pipeline-stage.pipelineStageSql` (SQL), `leads/pipeline-utils.derivePipelineStage` (JS, parity-pinned), `leads/board-rows.ts:95-109`, `analytics/pipeline-analytics.ts:285-292` (orphan), `operations/reports.ts:312` (`PIPELINE_STAGE_GROUPS` — **different vocabulary**), `team/admin-command-summary.buildPipelineHealth` | SQL `pipelineStageSql`; **fix `reports.ts` vocabulary drift** |
| Attention items | `team/attention-policy.buildRepAttentionSignals/buildTeamAttention` (canonical), `operations/rep-360.buildRepAttention`, `relay/dashboard-loader.buildCommandCenterFromActivity` (orphan consumer), `team/admin-command-summary.buildOrgAttentionExtras`, `admin/org-command-snapshot.ts` (orphan), `admin/v3-command-present.buildAdminV3Attention` | `attention-policy` |
| Sidebar / Today counts | `operations/sidebar-counts.loadSidebarCounts`, `relay/today-counts.deriveTodayCounts`, `rep-home/v3-present.deriveRepV3MetricInput`, `team/manager-home-summary.ts:218-229`, `team/load-admin-command-center.assembleAdminCommandCenter` (fourth) | one count authority per scope |
| Performance / activity | `operations/performance.loadPerformance` + `analytics/aggregates.performanceMetricsSql`; `performance/activity-model.getRepDailyActivity` (also 2 API routes); `accountability/metrics.getRepAccountability` | keep two stacks, document boundary |
| Team day | `rep-day/team.loadTeamDay` — 3 callers, no shared memo (`team/load-manager-home`, `team/load-admin-command-center`, `operations/people`) | add request memo |

### 6.4 Orphaned modules (zero specifier imports in `src`/`tests`/`e2e`/`scripts`)

```
src/components/account-settings.tsx
src/components/account/account-360-view.tsx
src/components/admin/admin-primitives.tsx          ← entire design system
src/components/admin/events-drilldown.tsx
src/components/admin/team-live-board.tsx            ← best team execution visual
src/components/app-rail.tsx                        ← legacy shell
src/components/conversation/conversation-context-rail.tsx
src/components/conversation/conversation-relay.tsx
src/components/dashboard/admin-dashboard.tsx
src/components/dashboard/analytics/pipeline-analytics-view.tsx  ← best chart suite
src/components/email-outreach-panel.tsx
src/components/generation-mode-selector.tsx
src/components/growth/growth-engine-dashboard.tsx
src/components/jobs/jobs-search-client.tsx
src/components/landing/relay-cta.tsx
src/components/leads-board.tsx
src/components/manager/manager-team-view.tsx
src/components/performance/admin-performance-overview.tsx
src/components/rep/manager-drilldown.tsx
src/components/rep/my-day-card.tsx
src/components/rep/responsibility-card.tsx
src/components/rep/team-view.tsx
src/components/studio-today.tsx
src/components/ui/action-line.tsx
src/components/ui/avatar.tsx
src/components/ui/breadcrumb.tsx
src/components/ui/card.tsx
src/components/ui/inline-notice.tsx
src/components/ui/page-shell.tsx
src/components/ui/sparkline.tsx
src/components/ui/switch.tsx
src/lib/admin/command-center-v2.ts                ← second command-center loader
src/lib/admin/org-command-snapshot.ts             ← third attention builder
src/lib/conversation/inbox.ts                     ← loadInbox() never imported
src/lib/landing-motion.ts
src/lib/orchestration/reconciliation.ts
src/lib/relay/reply-intelligence.ts
```

**~384 exported functions/constants** have zero references outside their defining file; ~938 more type/interface exports.

### 6.5 Dead UI bodies with live type exports (must not delete blindly)

These modules are imported for their **types only** — deleting the file breaks the build.
Harvest the types first, then remove the UI body.

| Module | Live export(s) | Dead UI |
|---|---|---|
| `src/components/relay-today-workspace.tsx` (943) | `RelayTodayAction` | entire component |
| `src/components/rep/rep-workspace.tsx` (474) | `RepWorkspaceData` | entire component |
| `src/components/rep/rep-today.tsx` (993) | `ExecutionHealthData` | entire component |

### 6.6 Verified safe to delete (after reference re-point)

Candidates for Phase 34 — each needs its own `rg` re-run at deletion time:

- `src/components/app-rail.tsx` — superseded by `RelayAppShell`; 2 tests read it (`tests/relay-ux-2026-10-25.test.ts:78`, `tests/relay-regression-corpus.test.ts:197`) → update tests first.
- `src/lib/navigation/relay-shell-nav.ts` — keep `v3SidebarItems`/`v3MobileNavItems`/`detectRelayShellSection`/`resolveV3SidebarActiveId`; delete `RELAY_TOP_NAV`, `RELAY_SECTION_NAV`, `visibleTopNav`, `sectionNavItems`, `resolveSectionActiveItem` (tests at `tests/operations-workspace.test.ts:52`, `tests/relay-shell-nav.test.ts`).
- `src/components/admin/admin-primitives.tsx` — **do not delete**: restore as the shared admin primitive set.
- `src/components/dashboard/analytics/pipeline-analytics-view.tsx` + `src/lib/analytics/pipeline-analytics.ts` — **do not delete**: revive as the analytics visual library; first verify `buildDashboardAnalytics` still matches current schema.
- `src/components/ui/sparkline.tsx` — orphan with hardcoded colours; fold into the revived chart library or delete.
- `src/components/ui/{action-line,avatar,breadcrumb,card,inline-notice,page-shell,switch}.tsx` — orphan primitives; confirm no barrel re-export before deleting.
- `src/components/ui/toast.tsx` `useToast` — dead export.
- `src/components/ui/{page-header.SectionHeader,tabs.TabContent,empty-state.OnboardingGuide}` — dead exports.

---

## 7. Security / correctness observations (non-blocking, recorded)

1. **`/leads/[id]/page.tsx`** — **FIXED (Phase 6A).** `getLead` now enforces an explicit
   organization boundary (cross-org → 404, no existence leak) and accepts an optional
   `LeadReadScope` so the page authorizes reps/managers against their operational scope.
   Denial is indistinguishable from a missing lead. Unscoped callers (API routes) keep the
   original ownership gate, so the change does not widen API access.
   Gates: `LEAD_360_ROLE_SCOPE`, `LEAD_360_MANAGER_SCOPE`, `LEAD_360_CROSS_ORG_DENIED`.
2. **`/content-v2/growth/page.tsx` + `/admin/growth/page.tsx`** — **FIXED (Phase 6.1).** Both now call `requireProductAdmin()`, which authorizes from `AuthContext` (the canonical source) instead of the possibly-stale `reps.role`.
3. **`/admin/command`, `/admin/command/[repId]` allow managers** — **confirmed intentional** (existing tests: `ROLE_TEAM_RAIL` asserts managers keep Daily Operations). Nav now exposes it as *Team → Daily Operations* for managers and *Admin → Command Center* for admins, so no one needs to see an Admin section they cannot use.
4. **`src/proxy.ts`** — **FIXED (Phase 6.3).** Added the missing prefixes (`/reports`, `/tasks`, `/chats`, `/relay`, `/inbound`, `/notifications`, `/performance`, `/accounts`, `/accountability`, `/profile-intelligence`, `/workspace`, `/revenue`, `/rep`, `/studio`, `/content-v2`, `/home`). Gate: `APP_ROUTE_PROXY_COVERAGE`.
5. **`lib/operations/reports.ts` `PIPELINE_STAGE_GROUPS`** — **FIXED (Phase 6B).** The CRM stage vocabulary now lives in `lib/sales/stage-vocabulary.ts` and is imported by reports, performance, conversations and meetings. Gate: `REPORT_PIPELINE_CANONICAL_STAGE_PARITY`.

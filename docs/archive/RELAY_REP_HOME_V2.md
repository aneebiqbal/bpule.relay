# Relay Rep Home V2 — Phase 3 contract

> **Route:** `/dashboard` (alias `/home` → redirect)  
> **Audience:** Rep (and manager personal queue before Team Home in a later phase)  
> **Date:** 2026-10-31

---

## CURRENT (pre–Phase 3 implementation)

### Component tree (rep branch)

```text
dashboard/page.tsx
└─ Suspense
   └─ RepDashboard
      ├─ RepDayPanel (optional) OR DashHeader
      ├─ 4× StatTile metrics
      ├─ Do this next (Panel + ranked rows from upNext only — excludes nextAction)
      ├─ Duplicate TaskPanels (replies, follow-ups, high-priority, research, new, referred)
      ├─ Today's targets (Panel + Meter)
      ├─ Recent work
      └─ ActivityHeatmapSection (client fetch /api/performance/activity)
   └─ PipelineAnalyticsView (Suspense, all roles including rep)
```

### Role branching (`dashboard/page.tsx`)

| Condition | View |
|---|---|
| `isOwner \|\| isAdmin` | `AdminDashboard` + analytics |
| `isManager && managedTeamIds.length` | `ManagerTodayView` + analytics |
| else | `RepDashboard` + analytics |

### Data loaders (rep)

| Loader | Source |
|---|---|
| `loadRepWorkspaceData(repId)` | Orchestrator |
| → `getDailyWorkspace()` | Targets, identities, day shell |
| → `store.getTodayDashboard()` | Queue, follow-ups, upwork |
| → `store.getRelayQueueData()` | Conversations, messages |
| → `loadRepDay()` | Rep day state |
| → `buildRelayQueue` + `filterQueueByRole` + `rankNextActions` | Canonical tasks |
| → `deriveTodayCounts(allActions)` | KPI alignment |
| → `countProfilesPulled`, referred/recent leads, upwork slice | Secondary |

**Profile scope (before Phase 3):** queue built from full rep book; KPIs not filtered by active workspace cookie (inbox/chats already scoped per BUG-30).

### Query waves (approximate)

1. `getAuthContext` + `loadAccountabilityDashboard` (admin path only uses acData on admin branch; rep still pays accountability fetch today — **Phase 3 removes rep analytics wave**)
2. `loadRepWorkspaceData`: `getTodayDashboard` ∥ `getRelayQueueData` ∥ `loadRepDay` (after `getDailyWorkspace`)
3. Secondary: profiles pulled, referred, recent, upwork, suppressed IDs
4. Client: heatmap `GET /api/performance/activity?range=12w`
5. Client: `PipelineAnalyticsView` via `loadBoardData` + `buildDashboardAnalytics`

### Profile switch

`ActiveIdentityProvider.selectIdentity` → cookie + `router.refresh()` → RSC reload. Rep Home must scope server data to `resolveActiveWorkspace()` (Phase 3).

### Today counters

From `deriveTodayCounts(allActions)` — same list as sections should use (`TODAY_REPLY_KINDS`, `TODAY_FOLLOWUP_KINDS`).

---

## TARGET (Phase 3 implemented)

Five sections only:

1. **Header** — greeting + date (profile in global shell)
2. **Operational metrics** — 4 cards, clickable → scroll/filter queue
3. **Do this next** — ranked list, one primary CTA, `allActions` order
4. **My work** — tabs Today / Overdue / Upcoming / Completed (presentation over same canonical actions + today accountability)
5. **Personal scoreboard** — compact weekly target + connection/reply/meeting/proposal/win counts

**Removed from rep home:** duplicate task panels, pipeline analytics block, 12-week heatmap, recent-work gallery, `RepDayPanel` hero duplication.

---

## DATA SOURCES (unchanged semantics)

| Need | Authority |
|---|---|
| Ranked work | `buildRelayQueue` → `rankNextActions` → `RelayTodayAction[]` |
| KPI counts | `deriveTodayCounts` on scoped `allActions` |
| High priority | Existing action kinds + priority (no new score rule) |
| Completed today | `targetSummary` completed counts (accountability) for active identity |
| Reply / follow-up | Queue engine + conversation policy (no status-only replies) |
| Profile scope | `resolveActiveWorkspace()` + `leadBelongsToWorkspace()` |

---

## CANONICAL OWNERS

| Concern | Owner module |
|---|---|
| Queue / tasks | `lib/relay/queue-engine.ts`, `lib/relay/next-best-action.ts` |
| Follow-up due | `lib/conversation/follow-up-policy.ts` (via lead state machine) |
| Today KPI parity | `lib/relay/today-counts.ts` |
| Workspace cookie | `lib/workspace/active-identity.ts`, `ActiveIdentityProvider` |
| Targets / completed | `getDailyWorkspace` / store accountability |

---

## NO-CHANGE CONTRACTS

- V3 scoring, buyer-intent, sender routing, follow-up policy, message quality, RLS, outcome taxonomy, conversation state, profile attribution (`leadBelongsToWorkspace`).
- No new task DB table or task state engine in Phase 3.
- Admin/manager dashboard branches unchanged in this phase except rep analytics decoupling.

---

## IMPLEMENTATION NOTES (2026-10-31)

| Area | Change |
|---|---|
| UI | `RepHomeView` — 5 sections; `RepDashboard` delegates |
| Loaders | `resolveActiveWorkspace()` scopes leads, follow-ups, targets, actions |
| Perf | Rep path skips `loadAccountabilityDashboard` + pipeline analytics |
| Tests | `tests/rep-home.test.ts` (9 cases) |
| Deep links | `actionDeepLink()` → conversation tab for reply/follow-up |

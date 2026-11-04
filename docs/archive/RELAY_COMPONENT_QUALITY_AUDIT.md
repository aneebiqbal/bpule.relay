# RELAY COMPONENT QUALITY AUDIT

**Status:** Phase 2 complete (static source audit). No component has been deleted.
**Method:** ripgrep sweep of `src` for Heatmap/Chart/Sparkline/Funnel/Pipeline/Progress/Ring/Gauge/Bar/Trend/Timeline/Metric/KPI/ScoreRing/Donut/Area, plus SVG/canvas/ResizeObserver/ARIA markers; importer tracing for every hit.
**Chart library:** recharts ^3 only (`package.json:42`). No d3/chart.js/victory/visx/nivo. 8 files import recharts.
**Responsive:** no `ResizeObserver`, no container queries anywhere — responsive behaviour is recharts `ResponsiveContainer` + CSS grid/flex.

Hard rule applied: *if an old Admin/Analytics component is visually stronger than the new one, it is reused/modernized, not deleted.*

Scores are source-level judgments grounded in the cited evidence. `/10` = 10 is production-premium.

---

## 1. Headline findings

1. **The most polished chart suite in the codebase is dead.** `src/components/dashboard/analytics/pipeline-analytics-view.tsx` (573 lines: KPI cards + sparklines, composed bar/line chart, stage bars, funnel, two donuts, bar lists, rep leaderboard, heatmap) has **zero importers**; its data builder `buildDashboardAnalytics` (`src/lib/analytics/pipeline-analytics.ts:205`) is also never called. It is the only chart file fully tokenised for dark mode, has `role="img"` + aria-labels on every surface, tooltips, legends, empty states, and range tabs.
2. **The entire admin design system is orphaned.** `src/components/admin/admin-primitives.tsx` (`AdminCard`, `MetricCard`, `SectionHeader`, `Eyebrow`, `ProgressBar`, `StatusDot`, `AdminPageHeader`) has **zero importers**. Live pages re-implement the same primitives locally (`growth-dashboard.tsx:185`, `manager-home-view.tsx:390`, `rep-home-view.tsx:80`).
3. **A large legacy "v3 rep workspace" subtree is dead.** `rep-workspace.tsx`, `rep-today.tsx`, `relay-today-workspace.tsx`, `my-day-card.tsx`, `bd-daily-desk.tsx`, `rep-day-panel.tsx`, `execution-health-card.tsx`, `do-this-next.tsx`, `up-next.tsx` — none rendered; only exported *types* are imported. Live rep home is `rep-home-view.tsx` → `v3/primitives.tsx`.
4. **Near-duplicates everywhere:** 3 funnel renderers, 3 team stacked-bar charts, 2 trend charts, 4 progress-ring implementations, 4 progress-bar primitives, 3 KPI card sets.
5. **Accessibility is bimodal.** `ContributionHeatmap`, `ScoreRing`, `Meter`, `ScoreBreakdown`, `RepDayPanel`, `FunnelTable` and the recharts views have real ARIA. Most hand-rolled div bars have none.

---

## 2. Ranked component audit

### 2.1 Best-in-class (reuse targets)

| Component | Path | Current page | Data source | Visual /10 | Responsive /10 | Accessibility | Performance | Verdict |
|---|---|---|---|---|---|---|---|---|
| `ContributionHeatmap` | `src/components/performance/contribution-heatmap.tsx` (208) | `/performance` (LIVE) | `getRepDailyActivity()` → `/api/performance/activity` | 9 | 9 | **10** — `role="group"` `:75`, real `<button>` cells `aria-label` `:106`, focus-visible `:91`, `role="tooltip"` `:113` | 9 — server aggregate | **KEEP_AND_REUSE** — canonical heatmap |
| `Meter` | `src/components/dashboard/kit.tsx:106-115` | 9 live admin pages | per-page loaders | 8 | 8 | **10** — `role="progressbar"` + `aria-valuenow/min/max` `:112` | 9 | **KEEP_AND_REUSE** — canonical progress bar |
| `ScoreRing` / `LeadScoreRing` | `src/components/score-ring.tsx` (94) | `/leads/new`, `leads-board-v2`, `leads-table`, `prospects-workspace`, `lead-workspace-simple`, `prospect-analyze` | `getLeadDisplayScore` / `displayScoreFromCanonical` | 8 | 8 | 9 — `role="img"` + computed `aria-label` `:45,48` | 9 | **KEEP_AND_REUSE** — canonical score visual |
| `FunnelTable` + comparison tables | `src/components/operations/performance-views.tsx` (223) | `/reports/team`, `/accounts/[company]`, `/team/[repId]`, `/team/groups/[teamId]` | `lib/operations/performance.ts` + `targetProgressSql` | 7 | 9 | **10** — `<caption class="sr-only">` `:19,93`, `aria-hidden` bar `:49`, `scope` on headers | 9 | **KEEP_AND_REUSE** — canonical comparison surface |
| `ScoreBreakdown` | `src/components/score-breakdown.tsx` (173) | `prospect-analyze`, `lead-workspace-simple` | `normalizeScoreDimensions` / `normalizeScoreCalculation` | 8 | 8 | 9 — `role="meter"` + `aria-label` + `aria-value*` `:145-149` | 9 | **KEEP** |
| `LeadStageStrip` | `src/components/sales/lead-stage-strip.tsx` (66) | `lead-workspace-async` | `derivePipelineStage` | 8 | 9 | 9 — `<nav aria-label>` + `aria-current="step"` `:30,38` | 9 | **KEEP** |
| `UpworkJobTimeline` | `src/components/upwork-job-timeline.tsx` (119) | `/upwork/[id]` | `PATCH /api/upwork/jobs/[id]` | 8 | 8 | 9 — `role="group"` + `aria-pressed` `:64,73,100` | 9 | **KEEP** |
| `DecisionTraceView` | `src/components/leads/decision-trace-view.tsx` (121) | `lead-workspace-simple` | `lib/relay/decision-trace.ts` | 8 | 8 | 6 — no ARIA on timeline | 9 | **KEEP** |
| `CommandCentre` | `src/components/admin/command-centre.tsx` (230) | `/admin/command` | `TeamDaySummary` from `lib/rep-day/team.ts` | 8 | 8 | 8 — `Meter` accessible, `aria-label` on rep links `:94` | 9 | **KEEP** |
| `ReportViews.CountTable` | `src/components/reports/report-views.tsx` (118) | `/reports/{sales,pipeline,revenue,team}` | `lib/operations/reports.ts` | 7 | 8 | 9 — `sr-only` caption, `scope`, `sr-only` change text `:62-65` | 9 | **KEEP** |
| `RevenueIntelligenceDashboard` | `src/components/admin/revenue-intelligence-dashboard.tsx` (451) | `/admin/revenue-intelligence` | `/api/admin/revenue-intelligence?range=` | 8 | 8 | 6 — `role="img"` only on trend chart `:233`; funnel/stage/fit bars no ARIA | 8 | **KEEP + A11Y FIX** |
| `AiUsageChart` | `src/components/admin/ai-usage-chart.tsx` (38) | `/admin/ai-usage` | `/api/admin/ai-usage` | 7 | 8 | 7 — `role="img"` `:12`, no keyboard | 9 | **KEEP** |
| `TaskBoard` | `src/components/operations/task-board.tsx` (479) | `/accounts/[company]`, `/team/[repId]`, `/team/tasks`, `/team/groups/[teamId]` | `UnifiedTask[]` + `PATCH /api/tasks/[id]` | 7 | 8 | 8 — `aria-current` tabs, `scope` in drawer, `role="alert"` error | 8 | **KEEP** |
| `RepHomeView` | `src/components/rep/rep-home-view.tsx` (263) | `/dashboard` (rep) | `RepWorkspaceData` built in `dashboard/page.tsx:87-379` | 8 | 9 | 7 — section `aria-label`s, `role="tablist"` `:148-167`; inline target bar unlabelled | 8 | **KEEP + EXTEND** |
| `AdminCommandCenterView` | `src/components/admin/admin-command-center-view.tsx` (196) | `/dashboard` (owner/admin) | `loadAdminCommandCenter()` | 8 | 9 | 6 — V3 bars unlabelled | 8 | **KEEP + EXTEND** |
| `ManagerHomeView` | `src/components/manager/manager-home-view.tsx` (424) | `/dashboard` (manager) | `loadManagerHomeTeam()` | 7 | 8 | 6 | 8 | **KEEP + A11Y FIX** |

### 2.2 Legacy components that are BETTER than the live replacement

| Legacy component | Path | Visual /10 | Why it wins | Disposition |
|---|---|---|---|---|
| `PipelineAnalyticsView` | `src/components/dashboard/analytics/pipeline-analytics-view.tsx` (573) | **9** | Full KPI+sparkline cards, composed bar/line chart, stage bars, funnel, 2 donuts, bar lists, rep leaderboard, heatmap, range tabs. Only fully dark-mode-tokenised chart file (`C` palette `:39-51`). `role="img"` + aria-labels on all four recharts surfaces `:215,310,396` and heatmap. | **KEEP_AND_REUSE** — revive as the canonical analytics/insights visual library. Cons: no keyboard on charts; tooltips not focusable. |
| `admin-primitives.tsx` | `src/components/admin/admin-primitives.tsx` (111) | **8** | `AdminCard`, `MetricCard`, `SectionHeader`, `Eyebrow`, `ProgressBar`, `StatusDot`, `AdminPageHeader` — a complete design system, zero importers. | **KEEP_AND_REUSE** — restore as the shared admin primitive set; replace local re-implementations. |
| `TeamLiveBoard` | `src/components/admin/team-live-board.tsx` (177) | **8** | recharts stacked horizontal Done/Left/Behind bar with custom tooltip and Cell colours; richer information density than live `V3StageStrip`; 15s polling + focus refresh. | **KEEP_AND_REUSE** — adopt for Team workload/execution visual. Cons: no ARIA. |
| `RepDayPanel` | `src/components/rep/rep-day-panel.tsx` (292) | **8** | `role="progressbar"` + aria `:130`, custom cubic-bezier `:133`, commitment rows. | **KEEP** — harvest the accessible progress pattern. |

### 2.3 Dead but lower value (deletion candidates, subject to reference search)

| Component | Path | Lines | Note |
|---|---|---|---|
| `TeamView` (rep) | `src/components/rep/team-view.tsx` | 210 | stacked bar, no ARIA; superseded by `TeamLiveBoard` |
| `ManagerTeamView` | `src/components/manager/manager-team-view.tsx` | 140 | near-identical to `rep/team-view.tsx:92-105` |
| `MyDayCard` | `src/components/rep/my-day-card.tsx` | 348 | superseded by `RepHomeView` |
| `BdDailyDesk` | `src/components/rep/bd-daily-desk.tsx` | 481 | dead; only consumer of `SignalFeed` |
| `DoThisNext` / `UpNext` (rep) | `src/components/rep/{do-this-next,up-next}.tsx` | 107 / 71 | superseded |
| `AdminPerformanceOverview` | `src/components/performance/admin-performance-overview.tsx` | 141 | per-rep health bar, no ARIA |
| `ExecutionHealthCard` | `src/components/performance/execution-health-card.tsx` | 133 | only via dead `rep-workspace` |
| `AdminDashboard` | `src/components/dashboard/admin-dashboard.tsx` | 220 | superseded by `AdminCommandCenterView` |
| `LeadsBoard` | `src/components/leads-board.tsx` | 316 | superseded by `leads-board-v2` |
| `Account360View` | `src/components/account/account-360-view.tsx` | 162 | superseded by `ConversationTable` + `TaskBoard` |
| `GrowthEngineDashboard` | `src/components/growth/growth-engine-dashboard.tsx` | 604 | superseded by `content-v2/growth` |
| `ResponsibilityCard` | `src/components/rep/responsibility-card.tsx` | 188 | dead; only inbound link to `/workspace/[id]` |
| `EventsDrilldown` | `src/components/admin/events-drilldown.tsx` | 156 | modal event list |
| `ManagerDrillDown` | `src/components/rep/manager-drilldown.tsx` | 187 | dead |
| `SignalFeed` | `src/components/signal/signal-feed.tsx` | 136 | dead via `bd-daily-desk` |
| `UnifiedInbox` | `src/components/inbox/unified-inbox.tsx` | — | dead via `bd-daily-desk` |
| `Sparkline` / `TrendCard` | `src/components/ui/sparkline.tsx` | 83 | ORPHAN; **hardcoded hex colours** `:18,25` break dark mode; gradient `id` collision risk |
| `OnboardingGuide` | `src/components/ui/empty-state.tsx:45-71` | 27 | export never imported; `EmptyState` itself is live |
| `relay-today-workspace.tsx` | `src/components/relay-today-workspace.tsx` | 943 | dead UI; only `RelayTodayAction` type used |
| `rep-workspace.tsx` | `src/components/rep/rep-workspace.tsx` | 474 | dead UI; only `RepWorkspaceData` type used |
| `rep-today.tsx` | `src/components/rep/rep-today.tsx` | 993 | dead UI; only `ExecutionHealthData` type used |

**Dead component total: ~7,500+ lines.**

---

## 3. Near-duplicate register (Phase 18 input)

| Concept | Implementations | Canonical choice |
|---|---|---|
| Funnel | `pipeline-analytics-view.tsx:268-296` (dead, best visual), `revenue-intelligence-dashboard.tsx:196-226` (live, no ARIA), `operations/performance-views.tsx:14-60` (live, best a11y, table form) | Merge: adopt dead funnel's visual + live table's ARIA |
| Team stacked bar | `rep/team-view.tsx:92-105` (dead), `manager-team-view.tsx:78-91` (dead), `admin/team-live-board.tsx:97-133` (dead, richest) | `TeamLiveBoard` pattern |
| Trend chart | `pipeline-analytics-view.tsx:211-230` (dead, richer: 5 series + sparkline KPIs), `revenue-intelligence-dashboard.tsx:228-265` (live, 1 series) | Dead `ActivityChart`, modernised |
| Progress ring | `score-ring.tsx` (live, a11y), `app-rail.tsx:269-292` (live, title only), `relay-app-shell.tsx:110-133` (live, aria-hidden), `rep-today.tsx:327-346` (dead, motion) | **One shared ring primitive** built on `ScoreRing`'s math + ARIA |
| Progress bar | `ui/progress.tsx` (live but only dead pages), `admin-primitives.tsx:84-91` (dead), `dashboard/kit.tsx:106-115` `Meter` (live, a11y), `rep-day-panel.tsx:130` (dead, a11y) | `Meter` |
| KPI card | `admin-primitives.MetricCard` (dead), `dashboard/kit.StatTile` (live), local `MetricCard` in `growth-dashboard.tsx:185` and `manager-home-view.tsx:390` (live) | `StatTile` |
| Daily jobs | `rep/daily-jobs.tsx` (live), `rep/rep-today.tsx:577-` (dead), `relay-today-workspace.tsx` (dead) | `daily-jobs.tsx` |
| Heatmap | `contribution-heatmap.tsx` only | Already canonical |

---

## 4. Cross-cutting quality signals

- **Dark mode:** good — `pipeline-analytics-view`, `revenue-intelligence-dashboard`, `ai-usage-chart`, `team-live-board`, `daily-jobs`, `score-ring`, `score-breakdown`. Bad — `ui/sparkline.tsx:18,25` hardcodes `#d4652f` / `#22c55e`.
- **Responsive:** recharts `ResponsiveContainer` in all 8 recharts files; `ContributionHeatmap` fluid grid. Everything else uses fixed heights (`h-[220px]`, `h-[260px]`, `h-[230px]`, `h-[170px]`).
- **Transitions:** `transition-[width] duration-500/700` on div bars; `transition-[stroke-dashoffset] duration-500` on rings; recharts default animations (disabled only in `MiniSpark`/`Donut`).
- **Keyboard support:** only `ContributionHeatmap`, `UpworkJobTimeline`, `LeadStageStrip`. All recharts surfaces and all div bars are mouse-only.
- **Skeletons:** present in most dead components; missing in live `ai-usage-chart`, `daily-jobs`.
- **Data-source hygiene:** all viz components are presentational. No component recomputes business rules except local percentage math. `pipeline-analytics-view` correctly delegates to `getLeadDisplayScore` / `derivePipelineStage`.

---

## 5. Phase 17 recommendation — shared visual library

Create `src/components/v3/visuals/` and migrate, in this order:

| Target | Source | Why |
|---|---|---|
| `ActivityHeatmap` | `contribution-heatmap.tsx` | Already best-in-class; move, don't rewrite |
| `ProgressBar` | `dashboard/kit.tsx` `Meter` | Only accessible bar; promote to shared |
| `ScoreRing` | `score-ring.tsx` | Canonical score visual |
| `TrendChart` | dead `pipeline-analytics-view.tsx:211-230` | Richer than the live trend chart |
| `Funnel` | dead `pipeline-analytics-view.tsx:268-296` + `performance-views.tsx` ARIA | Merge visual + a11y |
| `StageBars` | dead `pipeline-analytics-view.tsx:245-266` | Replaces `V3StageStrip` where bars add value |
| `MetricStrip` | `dashboard/kit.tsx` `StatTile` | Collapses 3 KPI card implementations |
| `ActivityTimeline` | `v3/primitives.tsx` `V3ActivityRow` | Already live |
| `ComparisonBars` | dead `TeamLiveBoard` pattern | Replaces 3 dead stacked-bar copies |
| `Ring` (unified) | merge `ScoreRing` + `relay-app-shell` send-limit ring | Kills 4 implementations |

Do **not** create a new heatmap, funnel, ring, or KPI card. Reuse the audited winner.

# RELAY DEAD CODE REMOVAL REPORT

Branch: `release-merge` · SHA at audit: `859130d` (+ stabilization commits)

## Method

Every candidate was checked with a repo-wide ripgrep over `src`, `tests`, `e2e`
and `scripts` for static imports, dynamic `import()` calls, route files, test
fixtures and computed paths. A file was removed only when **zero** references
remained outside its own dead cluster.

- Candidates checked: **59**
- Provably dead: **58**
- Removed in this pass: **48 files**
- Deliberately retained: see "KEPT ON PURPOSE"

One file was proven alive despite zero static importers:
`src/lib/intelligence-v2/index.ts` — dynamically imported by
`scripts/benchmark-intelligence.mjs:233` and `scripts/determinism-harness.mjs:49`.

---

## REMOVED

| FILE | WHY REMOVED | REPLACEMENT | REFERENCE CHECK |
|---|---|---|---|
| `src/components/account-settings.tsx` | No importer; superseded account surface | `/settings` (`ui/page-header` + settings sections) | `rg "account-settings"` → 0 |
| `src/components/account/account-360-view.tsx` | Old account-detail implementation, no importer | `src/app/(app)/accounts/[company]/page.tsx` | `rg "account-360-view"` → 0 |
| `src/components/admin/admin-primitives.tsx` | No importer; `Meter`/`ProgressBar` unused | `components/v3/primitives.tsx`, `ui/progress.tsx` | `rg "admin-primitives"` → 0 |
| `src/components/admin/events-drilldown.tsx` | No importer; event drilldown lives in ops timeline | `components/operations/ops-primitives.tsx` (`TimelineTable`) | `rg "events-drilldown"` → 0 |
| `src/components/content-dashboard.tsx` | Dead earlier Studio home | `src/components/content-v3/studio-home.tsx` | `rg "content-dashboard"` → 0 |
| `src/components/dashboard/admin-dashboard.tsx` | Dead admin dashboard, no importer | `src/components/admin/admin-command-center-view.tsx` | `rg "admin-dashboard"` → 0 |
| `src/components/email-outreach-panel.tsx` | No importer | `/revenue/email` workspace | `rg "email-outreach-panel"` → 0 |
| `src/components/generation-mode-selector.tsx` | No importer | generation mode is fixed per surface | `rg "generation-mode-selector"` → 0 |
| `src/components/growth/growth-engine-dashboard.tsx` | No importer | `/content/growth` (`content-v3/growth-v3.tsx`) | `rg "growth-engine-dashboard"` → 0 |
| `src/components/identity-chip.tsx` | No importer | `components/shell/profile-switcher.tsx` | `rg "identity-chip"` → 0 |
| `src/components/jobs/jobs-search-client.tsx` | No importer | Upwork surfaces under `src/app/(app)/upwork` | `rg "jobs-search-client"` → 0 |
| `src/components/landing/relay-cta.tsx` | No importer | `components/landing/landing-nav.tsx` CTA | `rg "relay-cta"` → 0 |
| `src/components/leads-board.tsx` | Superseded pipeline board | `src/components/leads/leads-board-v2.tsx` | `rg "leads-board['\"]"` → 0 |
| `src/components/log-reply-dialog.tsx` | Only used by the dead `leads-board.tsx` | `components/scoring/*` / conversation reply surfaces | importer dead |
| `src/components/manager/manager-team-view.tsx` | No importer | `src/components/manager/manager-home-view.tsx` | `rg "manager-team-view"` → 0 |
| `src/components/performance/admin-performance-overview.tsx` | No importer | `/team/performance` + `reports/team` | `rg "admin-performance-overview"` → 0 |
| `src/components/rep/manager-drilldown.tsx` | No importer | Manager Home drill-down links | `rg "manager-drilldown"` → 0 |
| `src/components/rep/my-day-card.tsx` | No importer | `src/components/rep/rep-home-view.tsx` | `rg "my-day-card"` → 0 |
| `src/components/rep/responsibility-card.tsx` | No importer | `/workspace/[revenueIdentityId]` live components | `rg "responsibility-card"` → 0 |
| `src/components/rep/team-view.tsx` | No importer | `/team` overview | `rg "rep/team-view"` → 0 |
| `src/components/studio-brand.tsx` | Only imported by dead `content-dashboard`/`studio-intro` | marketing brand in `(landing)` | importer dead |
| `src/components/studio-intro.tsx` | No importer | `(landing)` hero | `rg "studio-intro"` → 0 |
| `src/components/studio-today.tsx` | No importer | `src/components/content-v3/studio-home.tsx` | `rg "studio-today"` → 0 |
| `src/components/studio-v2/studio-today-v2.tsx` | Dead predecessor of V3 Studio | `src/components/content-v3/studio-home.tsx` | `rg "studio-today-v2"` → 0 |
| `src/components/studio-v2/growth-today-v2.tsx` | Dead predecessor of V3 Growth | `src/components/content-v3/growth-v3.tsx` | `rg "growth-today-v2"` → 0 |
| `src/components/conversation/conversation-context-rail.tsx` | Part of the dead pre-V3 conversation workspace cluster | `src/components/chats/chat-queue-list.tsx` | `rg` → 0 |
| `src/components/conversation/conversation-message.tsx` | Dead cluster leaf | `conversation/lead-conversation.tsx` | importer dead |
| `src/components/conversation/conversation-relay.tsx` | Dead cluster leaf | `conversation/lead-conversation.tsx` | `rg` → 0 |
| `src/components/conversation/conversation-waiting-state.tsx` | Dead cluster leaf | `conversation/lead-conversation.tsx` | importer dead |
| `src/components/conversation/conversation-workspace.tsx` | Dead pre-V3 conversation workspace | `conversation/lead-conversation.tsx` + `chats/*` | importers dead |
| `src/components/conversation/quick-refinement-chips.tsx` | Dead cluster leaf | `conversation/lead-conversation.tsx` | importer dead |
| `src/components/conversation/relay-intervention.tsx` | Dead cluster leaf | `components/tasks/assign-task-dialog.tsx` | importer dead |
| `src/components/conversation/relay-presence.tsx` | Dead cluster leaf | `conversation/lead-conversation.tsx` | importers dead |
| `src/components/conversation/reply-composer.tsx` | Dead cluster leaf | `conversation/lead-conversation.tsx` | importer dead |
| `src/components/relationship/index.ts` | Whole directory unreferenced | `components/sales/lead-preview-drawer.tsx` | `rg "components/relationship"` → 0 |
| `src/components/relationship/log-relationship-update.tsx` | Dead directory | conversation timeline / lead context panel | importer dead |
| `src/components/relationship/next-action-card.tsx` | Dead directory | `v3/primitives.tsx` (`V3ActionRow`) | importer dead |
| `src/components/relationship/paste-client-reply.tsx` | Dead directory | reply composer inside Lead 360 | importer dead |
| `src/components/relationship/waiting-state.tsx` | Dead directory | `chats/chat-queue-list.tsx` | importer dead |
| `src/lib/admin/command-center-v2.ts` | Dead V2 command loader; only its own dead leaf imported it | `src/lib/admin/v3-command-present.ts` | importer dead |
| `src/lib/admin/org-command-snapshot.ts` | No importer | `src/lib/admin/v3-command-present.ts` | `rg` → 0 |
| `src/lib/conversation/inbox.ts` | No importer | `src/lib/operations/chat-queue.ts` | `rg` → 0 |
| `src/lib/db/index.ts` | Barrel only; consumers import `@/lib/db/types` directly | `src/lib/db/types.ts` | `rg "@/lib/db['\"]"` → 0 |
| `src/lib/email/providers/index.ts` | Barrel only; providers imported directly | individual provider modules | `rg "email/providers['\"]"` → 0 |
| `src/lib/landing-motion.ts` | No importer | motion primitives in `globals.css` | `rg "landing-motion"` → 0 |
| `src/lib/orchestration/reconciliation.ts` | No importer | orchestration entry points in `src/lib/orchestration/*` | `rg "reconciliation"` → 0 |
| `src/lib/relay/admin-intelligence.ts` | Only imported by dead `command-center-v2.ts` | `src/lib/admin/v3-command-present.ts` | importer dead |
| `src/lib/relay/reply-intelligence.ts` | No importer | `src/lib/relay/revenue-strategy.ts` + scoring explainers | `rg` → 0 |

Dead exports inside live files (not file deletions):

| SYMBOL | FILE | ACTION |
|---|---|---|
| `SectionHeader` | `src/components/ui/page-header.tsx` | unused export |
| `TabContent` | `src/components/ui/tabs.tsx` | unused export |
| `OnboardingGuide` | `src/components/ui/empty-state.tsx` | unused export |
| `useToast` | `src/components/ui/toast.tsx` | unused export; `ToastProvider` stays live |

---

## KEPT ON PURPOSE (audit disagreements resolved)

These were flagged as zero-importer but are deliberately retained:

| FILE | REASON |
|---|---|
| `src/components/ui/sparkline.tsx` | Strongest-but-unused sparkline; selected for reuse in the shared V3 visual system rather than deletion. |
| `src/components/dashboard/analytics/pipeline-analytics-view.tsx` | Richest visual asset in the repo (KPIs + deltas + trend + funnel + heatmap + leaderboard); revival candidate. Also still asserted by `e2e/dashboard-analytics.spec.ts`. |
| `src/components/admin/team-live-board.tsx` | Strongest stacked-bar implementation found; move, don't delete. |
| `src/components/contribution-heatmap*` (`performance/contribution-heatmap.tsx`) | Live, single canonical heatmap (4 importers). |
| `src/components/relay-today-workspace.tsx` | UI body unmounted, but `RelayTodayAction` type is imported by live code. |
| `src/components/rep/rep-workspace.tsx` | UI body unmounted, `RepWorkspaceData` type is live. |
| `src/components/rep/rep-today.tsx` | UI body unmounted, `ExecutionHealthData` type is live. |
| `src/components/performance/execution-health-card.tsx` | Imported only by the two type-live files above. |
| `src/components/rep/{bd-daily-desk,do-this-next,up-next,rep-day-panel}.tsx` | Dead UI bodies behind live types; harvest types before any future removal. |
| `src/components/inbox/unified-inbox.tsx` | Reachable only through the type-live `rep-workspace.tsx`. |
| `src/components/ui/{action-line,avatar,breadcrumb,card,inline-notice,page-shell,switch}.tsx` | Standard UI-kit primitives with plausible future use; not product duplicates. |
| `src/lib/intelligence-v2/index.ts` | Dynamically imported by two benchmark scripts. |

## Compat redirects retained

These routes are redirect-only but are load-bearing for `src/proxy.ts`
allowlists, e2e suites and QA scripts — deleting them breaks real tooling:

`(app)/content-v2/*`, `(app)/home`, `(app)/account`,
`(app)/admin/command-center`, `(app)/admin/activity`,
`(app)/admin/accountability`, `(app)/admin/revenue-identities`,
`(app)/team/tasks`, `(app)/reports`, `(app)/admin`.

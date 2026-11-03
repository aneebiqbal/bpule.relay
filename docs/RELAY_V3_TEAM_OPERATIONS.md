# Relay V3 — Team Operations, Tasks and Rep 360

Sprint 4 turns Relay's management surfaces into one operational workspace:
**Work** (the rep's queue) and **Team** (the manager's command surface). Both
read the same canonical systems — no new task table, no new team state, no new
score.

## Information architecture

| Primary | Secondary | Route |
| --- | --- | --- |
| Work | My tasks / Today / Overdue / Upcoming / Completed | `/tasks` (`?view=`) |
| Team | Overview / People / Workload / Activity / Performance / Targets / Groups | `/team`, `/team/people`, `/team/workload`, `/team/activity`, `/team/performance`, `/team/targets`, `/team/groups` |
| Team | Rep 360 | `/team/[repId]` |

`/team/tasks` is a compatibility redirect to `/tasks?scope=team`. Team Tasks,
Team Activity, Team Performance and Rep Detail are **not** independent top-level
applications — they live inside Team.

## Canonical sources (do not duplicate)

- `assigned_tasks` + `task_events` — assigned work and its lifecycle.
- `UnifiedTask` (`src/lib/tasks`) — derived queue actions + assigned rows.
- `attention-policy` (`src/lib/team/attention-policy.ts`) — one deterministic
  attention authority. `buildTeamAttentionFromPeople` lets the Overview compute
  the same signals from directory rows, so attention can fail without taking
  the people list with it.
- `loadPeopleDirectory` — people, teams and attention from Manager Home's
  contract. Team, People and Manager Home therefore agree by construction.
- `loadTimeline` (`src/lib/operations/activity.ts`) — sales events, task events
  and internal notes. Drafts, recommendations and page views are excluded.
- `getPerformance` / `loadPerformance` — aggregates only; no raw event transfer.
- `loadTargets` — stored daily goals; week/month are labelled derived.

## Tasks

- Header: **My work** for reps, **Team work** for managers/admins, with the
  real attention / overdue count.
- Views: Today, Overdue, Upcoming, Completed, All (`/tasks?view=…`).
- Filters: Assignee, Priority, Source, Due, Team, Related record — active
  filters render as removable chips.
- Source is human language: **Relay** for derived work, **From \<name\>** for
  assigned work. `DERIVED` / `ASSIGNED` never surface.
- Clicking a row opens one shared drawer (`TaskDetailDrawer`) with reason,
  assignee, creator, related lead, priority, due, status and `task_events`
  history. Start / Complete / Reassign / Reschedule / Cancel are
  permission-aware and go through `PATCH /api/tasks/[id]`.
- Derived tasks are projections: they disappear when the sales state resolves.
  No completion row is written.
- Mobile: cards, primary CTA reachable.

## Team

- **Overview** (`/team`): header count, team health (active today, replies
  waiting, overdue tasks, meetings, target progress), needs-attention list,
  per-person workload bars, compact people list, recent activity.
- **People** (`/team/people`): dense directory with search and team/status
  filters; rows open Rep 360.
- **Workload** (`/team/workload`): open work per person with replies, overdue,
  follow-ups and leads separated. Workload is context, never a score; capacity
  imbalance is flagged on its own.
- **Activity** (`/team/activity`): unified timeline, server-side filters,
  paginated/bounded.
- **Performance** (`/team/performance`): summary, conversion, rep / profile /
  source comparison. No composite score.
- **Targets** (`/team/targets`): read-only stored daily goals; derived week and
  month are labelled. Drafts never count.
- **Groups** (`/team/groups`): real team structure and scoping.

## Rep 360

Tabs: **Overview / Work / Leads / Activity / Performance**. Conversations are not
a tab — "Open Inbox" deep-links to `/chats?rep=<id>`, so there is one thread UI.

Intervention from the header: **Assign task**, **Request update** (an assigned
task, not a second model), **Open Inbox**, **Open Leads** (`/leads?owner=<id>`),
plus the existing More menu.

## Scope security

`resolveOperationalScope` → `resolveTaskAssigneeScope` is the one authority:

- Rep → own id only.
- Manager → managed team members + self.
- Admin / Owner → organization.

URL filters can only **narrow**: `effectiveRepIds` intersects requested
rep/team ids with the scope and returns `[]` for anything outside it. A rep
page outside scope is a 404, never an empty page. `canInterveneOnRep` gates
assign / reassign / request-update.

## Parity gates

- `V3_TEAM_REP360_HOME_PARITY` — Team overview attention and workload are
  computed from the same directory rows Manager Home and Rep 360 read.
- `V3_TASK_CROSS_SURFACE_PARITY` — open / overdue counts agree across Tasks,
  Rep 360 → Work, Manager Home and Admin Home.

## Tests and fixtures

- `tests/v3-team-operations.test.ts` — the named Sprint 4 fixtures
  (`V3_TASK_*`, `V3_TEAM_*`, `V3_REP360_*`, parity gates).
- `tests/fixtures/v3-team-fixtures.ts` — deterministic, realistic data covering
  the six rep archetypes (healthy, overloaded, replies waiting, overdue, strong,
  inactive) for browser QA. A fixture harness can import `FIXTURE_PEOPLE`,
  `FIXTURE_TASKS`, `FIXTURE_TIMELINE` and `FIXTURE_TEAMS` directly; the pages
  render from these shapes, so no lorem ipsum is needed to review the screens.

## Gates

`typecheck`, `lint`, `contracts`, full `vitest`, `build`. The named fixtures and
parity tests must pass with zero failures before commit.

## Visual gaps (closed in Sprint 5)

- Rep 360 Overview renders a compact pipeline from the canonical 7d funnel.
- Rep 360 Performance embeds the canonical 12-week `ContributionHeatmap`.
- Team Performance renders a replies / meetings / completed-tasks trend from a
  new aggregated SQL path (`teamTrendSql` + `teamTasksTrendSql`).

## Known gaps

- Live Neon Auth certification, browser screenshot matrix and egress
  measurement are separate from fixture QA. The demo workspace cannot render
  Supabase-backed surfaces (Tasks, Team, Rep 360), so those screens were
  verified by fixture and contract rather than by a real session.

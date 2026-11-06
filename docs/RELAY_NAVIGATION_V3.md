# RELAY NAVIGATION V3 — FINAL SHELL

**Authority:** `src/lib/navigation/relay-shell-nav.ts`, rendered by
`src/components/v4/v4-app-shell.tsx`.

```text
PRIMARY SIDEBAR   where am I in the product?      (domains, collapsible)
SECONDARY SIDEBAR what can I do in this domain?   (contextual, one level)
HEADER            search, create, notifications, account
PAGE              actual work
```

There is no third navigation layer. Page-local views use tabs or filters.
Exactly one primary and one secondary item is active.

---

## 1. Primary sidebar

Expanded `216px`, collapsed `68px` (persisted in `localStorage`). Icons +
labels expanded; icon + tooltip + active marker collapsed. Settings and Admin
sit below a hairline divider.

| # | Domain | Href | Rep | Manager | Admin | Owner |
|---|---|---|---|---|---|---|
| 1 | Home | `/dashboard` | ✅ | ✅ | ✅ | ✅ |
| 2 | Sales | `/leads` | ✅ | ✅ | ✅ | ✅ |
| 3 | Inbox | `/chats` | ✅ | ✅ | ✅ | ✅ |
| 4 | Work | `/tasks` | ✅ | ✅ | ✅ | ✅ |
| 5 | Team | `/team` | — | ✅ | ✅ | ✅ |
| 6 | Content | `/content` | ✅ | ✅ | ✅ | ✅ |
| 7 | Insights | `/reports/sales` | ✅ | ✅ | ✅ | ✅ |
| — | Settings | `/settings` | ✅ | ✅ | ✅ | ✅ |
| — | Admin | `/admin/command` | — | — | ✅ | ✅ |

Badges: Inbox (needs reply) and Work (actionable tasks) only. `null`/`0` render
nothing; `100+` renders `99+`.

## 2. Secondary rail

One contextual rail, rendered above the page. It is hidden only where the page
renders its own canonical sub-navigation (`pageOwnsSubNav` in the nav config):
`/chats`, `/notifications`, `/team/targets`, `/content/ideas`, lead detail,
rep 360 and company detail. Every other page keeps the rail — including record
details that have no tabs of their own, such as `/upwork/:id`.

### Sales
**Prospecting** — Prospects `/prospect` · Leads `/leads` · Pipeline `/leads?view=pipeline` · Companies `/accounts` (Admin+) · Import Leads `/leads/import`
**Channels** — Upwork `/upwork` · Email `/revenue/email`

### Inbox
**Queues** — Needs reply `/chats?view=waiting_me` · Waiting `/chats?view=waiting_them` · Follow-ups `/chats?view=followups` · All `/chats?view=all`
The seven secondary conditions live in the Filters drawer, not in navigation.

### Work
**Views** — My Tasks `/tasks` · Today `/tasks?view=today` · Overdue `/tasks?view=overdue` · Upcoming `/tasks?view=upcoming` · Completed `/tasks?view=completed`
**Team** (Manager+) — Team Tasks `/tasks?scope=team`

### Team
Overview `/team` · People `/team/people` · Profiles `/team/profiles` · Identities `/profile-intelligence?tab=identities` · Coverage `/team/coverage` · Workload `/team/workload` · Activity `/team/activity` · Performance `/team/performance` · Targets `/team/targets` · Groups `/team/groups` · Daily Operations `/admin/command` (Manager only)

Profiles is the canonical profile/identity front door: Add profile, Assign
profile, Coverage and Readiness are reachable from its header, and each profile
detail exposes Edit, Channels, Primary, Backups, Readiness and today's activity.

### Content
Studio `/content` · Ideas `/content/ideas` · Growth `/content/growth` (Admin+)

### Insights
**Reports** — Sales `/reports/sales` · Pipeline `/reports/pipeline` · Team `/reports/team` · Revenue `/reports/revenue` · Activity `/reports/activity`
**System** — AI Usage `/admin/ai-usage` (Admin+)

### Settings
**Account** — My Account `/settings` · Notifications `/notifications`

### Admin
**Organization** — Command Center `/admin/command` · People & Roles `/admin/people` · Targets `/admin/targets`
**Quality** — Scoring QA `/admin/scoring-qa` · QA & Trust `/admin/qa`
**System** — Dataset `/admin/dataset` · Training Data `/admin/training-data` · AI Usage `/admin/ai-usage` · Revenue Intelligence `/admin/revenue-intelligence`

Admin configures targets; Team reviews target progress. Profile and identity
management is canonical under Team — Admin reaches it from the Team rail or the
Command Center, never from a second duplicate entry.

## 3. Header

```text
[ breadcrumb / page identity ]        [ Search Relay ] [ + Create ] [ Bell ] [ User ]
```

No domain navigation in the header. The user menu holds Account, Appearance,
Preferences, Help & docs, the send-budget meter, and Sign out.

## 4. Mobile

Bottom bar: Home · Sales · Inbox · Work (rep) **or** Team (manager+) · More.
More opens a sheet with exactly the role-valid domains the bottom bar omits
(Work for managers; Content, Insights and Settings for reps) and their secondary
items. Inside a domain, secondary destinations render as horizontal tabs.

## 5. Active-state contract

`resolvePrimaryActiveId` and `resolveSecondaryActiveId` are the single authority.
Longest path wins, then most query params, then declaration order. A plain
destination owns its descendants, so `/leads/:id` keeps **Sales / Leads** active
in the breadcrumb even while the rail is hidden.

## 6. Tests

`tests/relay-shell-nav.test.ts` and `tests/v3/relay-v3-shell-nav.test.ts` enforce
`V3_PRIMARY_NAV_SINGLE_ACTIVE` · `V3_SECONDARY_NAV_SINGLE_ACTIVE` ·
`V3_NAV_ROUTE_MATRIX` · `V3_NESTED_ROUTE_SELECTION` ·
`V3_NAV_CANONICAL_LABELS` · `V3_NAV_ROLE_VISIBILITY` ·
`V3_NAV_HIDDEN_FEATURES_EXPOSED` · `V3_NAV_BREADCRUMB` · `V3_NAV_MOBILE` ·
`V3_CONTENT_NAV`. `tests/v3/relay-v3-shell-structure.test.ts` protects the shell
structure contract against `src/components/v4/v4-app-shell.tsx`.

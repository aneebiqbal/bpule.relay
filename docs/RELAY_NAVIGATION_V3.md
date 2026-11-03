# RELAY NAVIGATION V3 — FINAL SHELL

**Authority:** `src/lib/navigation/relay-shell-nav.ts`, rendered by
`src/components/shell/relay-app-shell.tsx`.

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

Width `224px`. Hidden on Home, on record detail (`/leads/:id`, `/team/:repId`,
`/accounts/:id`, `/upwork/:id`, `/profile-intelligence/:id`), and below `lg`.

### Sales
**Prospecting** — Prospects `/prospect` · Leads `/leads` · Pipeline `/leads?view=pipeline` · Companies `/accounts` (Admin+) · Import Leads `/leads/import`
**Channels** — Upwork `/upwork` · Email `/revenue/email`

### Inbox
**Queues** — Needs reply · Waiting · Follow-ups · Meeting requests · Proposal requests · Closed
**Manager** (Manager+) — Waiting >4h · Waiting >12h · Unassigned · Thread review

### Work
**Views** — My Tasks `/tasks` · Today · Overdue · Upcoming · Completed
**Team** (Manager+) — Team Tasks `/tasks?scope=team`

### Team
Overview `/team` · People `/team/people` · Workload `/team/workload` · Activity `/team/activity` · Performance `/team/performance` · Targets `/team/targets` · Groups `/team/groups` · Daily Operations `/admin/command` (Manager only)

### Content
Studio `/content` · Ideas `/content/ideas` · Growth `/content/growth` (Admin+)

### Insights
**Reports** — Sales `/reports/sales` · Pipeline `/reports/pipeline` · Team `/reports/team` · Revenue `/reports/revenue`
**System** — AI Usage `/admin/ai-usage` (Admin+)

### Settings
**Account** — My Account `/settings` · Notifications `/notifications`

### Admin
**Organization** — Command Center `/admin/command` · People & Roles `/admin/people` · Profiles `/profile-intelligence`
**Quality** — Scoring QA `/admin/scoring-qa` · QA & Trust `/admin/qa`
**System** — Dataset `/admin/dataset` · Training Data `/admin/training-data` · AI Usage `/admin/ai-usage` · Revenue Intelligence `/admin/revenue-intelligence` · Manage Profiles `/manage-profiles` (Owner)

## 3. Header

```text
[ breadcrumb / page identity ]        [ Search Relay ] [ + Create ] [ Bell ] [ User ]
```

No domain navigation in the header. The user menu holds Account, Appearance,
Preferences, Help & docs, the send-budget meter, and Sign out.

## 4. Mobile

Bottom bar: Home · Sales · Inbox · Work (rep) **or** Team (manager+) · More.
More opens a sheet with every remaining role-valid domain and its secondary
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
`V3_CONTENT_NAV`.

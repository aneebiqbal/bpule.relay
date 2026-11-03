# RELAY NAVIGATION V3 — FINAL

**Authority:** `src/lib/navigation/relay-shell-nav.ts`, rendered by
`src/components/shell/relay-app-shell.tsx`.
One role-aware model. Exactly one primary and one secondary item is active.

---

## 1. Primary domains

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

## 2. Secondary rail

### Sales
Prospects `/prospect` · Leads `/leads` · Pipeline `/leads?view=pipeline` ·
Import Leads `/leads/import` · Companies `/accounts` (Admin+) · Upwork `/upwork` ·
Email `/revenue/email`

### Inbox
Needs reply `/chats?view=waiting_me` · Waiting `/chats?view=waiting_them` ·
Follow-ups `/chats?view=followups` · Meeting requests `/chats?view=meeting_requests` ·
Proposal requests `/chats?view=proposal_requests` · Closed `/chats?view=closed`

### Work
Tasks `/tasks` · Today `/tasks?view=today` · Overdue `/tasks?view=overdue` ·
Upcoming `/tasks?view=upcoming` · Completed `/tasks?view=completed`

### Team (Manager+)
Overview `/team` · People `/team/people` · Workload `/team/workload` ·
Activity `/team/activity` · Performance `/team/performance` · Targets `/team/targets` ·
Groups `/team/groups` · Daily Operations `/admin/command` (Manager only)

### Content
Studio `/content` · Ideas `/content/ideas` · Growth `/content/growth` (Admin+)

### Insights
Sales Insights `/reports/sales` · AI Usage `/admin/ai-usage` (Admin+) ·
Revenue Intelligence `/admin/revenue-intelligence` (Admin+)

### Admin (Admin/Owner)
Command Center `/admin/command` · People & Roles `/admin/people` ·
Profiles `/profile-intelligence` · Scoring QA `/admin/scoring-qa` ·
QA & Trust `/admin/qa` · Dataset `/admin/dataset` · Training Data `/admin/training-data` ·
Manage Profiles `/manage-profiles` (Owner)

Home and Settings have no secondary rail.

## 3. Mobile

Bottom bar (five slots): Home · Sales · Inbox · Work (rep) **or** Team (manager+) · More.

**More** opens a sheet listing every remaining role-valid domain and its secondary
items. Nothing is desktop-only.

## 4. Command palette

`Open Studio` · `Create Post` · `Open Ideas` · `Open Growth` ·
`Analyze Prospect` · `Open Leads` · `Open Upwork` · `Open Inbox` · `Open Tasks` ·
`Open Overdue Tasks` · `Create task` · `Add Upwork job` · `Search lead` ·
`Open Needs Reply` · `Open Follow-ups` · `Add Lead` · `Switch profile` ·
`Quick Capture` · `Open Profiles` · `Today` · `Open Team` · `Open Sales Insights` ·
`Settings` · `Inbound Desk` · `Proof` · `Command Center` · `People & Roles` ·
`Revenue Intelligence` · `Profiles` · `Accounts` · `Team Tasks` · `Team Activity` ·
`Team Performance` · `Targets`

## 5. Canonical labels

One label per destination. Banned aliases: `Chats`, `Conversations`, `Find leads`,
`Open Team` (as a label — the domain is `Team`), `Daily operations`,
`Search profile`, `Relay Growth`.

| Destination | Label |
|---|---|
| `/chats` | Inbox |
| `/chats?view=waiting_them` | Waiting |
| `/leads` | Leads |
| `/leads?view=pipeline` | Pipeline |
| `/tasks` | Tasks |
| `/tasks?view=overdue` | Overdue |
| `/team` | Overview |
| `/team/people` | People |
| `/team/workload` | Workload |
| `/reports/sales` | Sales Insights |
| `/content` | Studio |
| `/content/ideas` | Ideas |
| `/content/growth` | Growth |
| `/admin/command` | Command Center (Admin) / Daily Operations (Team) |
| `/admin/people` | People & Roles |
| `/admin/revenue-intelligence` | Revenue Intelligence |
| `/upwork` | Upwork |
| `/prospect` | Prospects |

## 6. Breadcrumb

`<Domain> / <Secondary item>`; the item level is omitted when the domain has no
matching secondary item (for example `Home`).

## 7. Tests

`tests/relay-shell-nav.test.ts` and `tests/v3/relay-v3-shell-nav.test.ts` enforce
`V3_NAV_PRIMARY_SINGLE_ACTIVE` · `V3_NAV_SECONDARY_SINGLE_ACTIVE` ·
`V3_NAV_CANONICAL_LABELS` · `V3_NAV_ROLE_VISIBILITY` ·
`V3_NAV_HIDDEN_FEATURES_EXPOSED` · `V3_NAV_BREADCRUMB` · `V3_NAV_MOBILE` ·
`V3_CONTENT_NAV`.

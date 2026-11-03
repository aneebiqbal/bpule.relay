# RELAY ERP NAVIGATION — PHASE 4 FINAL

**Status:** implemented. One role-aware model in `src/lib/navigation/relay-shell-nav.ts`,
rendered by `src/components/shell/relay-app-shell.tsx`.

Structure: **primary sidebar (domains) + secondary rail (functions) + page content**.
Exactly one primary and one secondary item is active at any time.

---

## 1. Primary navigation

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

## 2. Secondary navigation by domain

### Sales
| Item | Href | Visible |
|---|---|---|
| Prospects | `/prospect` | all |
| Leads | `/leads` | all |
| Pipeline | `/leads?view=pipeline` | all |
| Import Leads | `/leads/import` | all |
| Companies | `/accounts` | Admin, Owner |
| Upwork | `/upwork` | all |
| Email | `/revenue/email` | all |

### Inbox
| Item | Href |
|---|---|
| Needs reply | `/chats?view=waiting_me` |
| Waiting | `/chats?view=waiting_them` |
| Follow-ups | `/chats?view=followups` |
| Meeting requests | `/chats?view=meeting_requests` |
| Proposal requests | `/chats?view=proposal_requests` |
| Closed | `/chats?view=closed` |

### Work
| Item | Href |
|---|---|
| Tasks | `/tasks` |
| Today | `/tasks?tab=today` |
| Overdue | `/tasks?tab=overdue` |
| Upcoming | `/tasks?tab=upcoming` |
| Completed | `/tasks?tab=completed` |

### Team (Manager+)
| Item | Href | Visible |
|---|---|---|
| People | `/team` | Manager+ |
| Team Tasks | `/team/tasks` | Manager+ |
| Activity | `/team/activity` | Manager+ |
| Performance | `/team/performance` | Manager+ |
| Targets | `/team/targets` | Manager+ |
| Groups | `/team/groups` | Manager+ |
| Daily Operations | `/admin/command` | Manager only |

### Content
| Item | Href | Visible |
|---|---|---|
| Studio | `/content` | all |
| Growth | `/content-v2/growth` | Admin, Owner |

### Insights
| Item | Href | Visible |
|---|---|---|
| Sales Insights | `/reports/sales` | all |
| AI Usage | `/admin/ai-usage` | Admin, Owner |
| Revenue Intelligence | `/admin/revenue-intelligence` | Admin, Owner |

### Admin (Admin/Owner)
| Item | Href |
|---|---|
| Command Center | `/admin/command` |
| People & Roles | `/admin/people` |
| Profiles | `/profile-intelligence` |
| Scoring QA | `/admin/scoring-qa` |
| QA & Trust | `/admin/qa` |
| Dataset | `/admin/dataset` |
| Training Data | `/admin/training-data` |
| Manage Profiles | `/manage-profiles` (Owner only) |

Home and Settings have no secondary rail.

## 3. Role matrix

| Domain | Rep | Manager | Admin | Owner |
|---|---|---|---|---|
| Home | ✅ | ✅ | ✅ | ✅ |
| Sales | ✅ | ✅ | ✅ | ✅ |
| Inbox | ✅ | ✅ | ✅ | ✅ |
| Work | ✅ | ✅ | ✅ | ✅ |
| Team | — | ✅ | ✅ | ✅ |
| Content | ✅ | ✅ | ✅ | ✅ |
| Insights | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ | ✅ |
| Admin | — | — | ✅ | ✅ |

Authorization authority is `AuthContext` (`isOwner`/`isAdmin`/`isManager`), not `reps.role`.

## 4. Mobile model

Bottom bar (5 slots max):

- Rep: Home · Sales · Inbox · Work · More
- Manager/Admin/Owner: Home · Sales · Inbox · Team · More

**More** opens a sheet listing every remaining role-valid domain and its secondary items
(Work/Content/Insights/Settings/Admin as applicable). Nothing is desktop-only.

## 5. Header

```
Sales / Leads                    ⌘ Search Relay...   + Create   🔔   User
```

- Left: brand + breadcrumb (desktop). Mobile: brand + menu.
- Center: global search / command palette.
- Right: Create, Notifications, Profile, send counter, theme, sign out.
- No primary nav, no duplicate tabs, no oversized profile switcher.

## 6. Breadcrumb contract

`<Domain> / <Secondary item>`; the item level is omitted when the domain has no matching
secondary item (e.g. `Home`).

Examples: `Sales / Leads`, `Sales / Pipeline`, `Team / Performance`, `Content / Studio`,
`Admin / Scoring QA`, `Inbox / Needs reply`.

## 7. Canonical labels

One label per destination. Banned aliases: `Chats`, `Conversations`, `Find leads`,
`Open Team`, `Daily operations` (as a nav label — the Team item is `Daily Operations`
per the Phase 6.2 contract), `Search profile`, `Relay Growth`.

| Destination | Canonical label |
|---|---|
| `/chats` | Inbox |
| `/leads` | Leads |
| `/leads?view=pipeline` | Pipeline |
| `/reports/sales` | Sales Insights |
| `/content` | Studio |
| `/team` | Team |
| `/tasks` | Tasks |
| `/admin/command` | Command Center (Admin) / Daily Operations (Team) |
| `/admin/scoring-qa` | Scoring QA |
| `/profile-intelligence` | Profiles |
| `/content-v2/growth` | Growth |
| `/admin/people` | People & Roles |
| `/admin/revenue-intelligence` | Revenue Intelligence |
| `/upwork` | Upwork |
| `/prospect` | Prospects |

## 8. Tests

`tests/relay-shell-nav.test.ts` and `tests/v3/relay-v3-shell-nav.test.ts` enforce:

`V3_NAV_PRIMARY_SINGLE_ACTIVE` · `V3_NAV_SECONDARY_SINGLE_ACTIVE` ·
`V3_NAV_CANONICAL_LABELS` · `V3_NAV_ROLE_VISIBILITY` ·
`V3_NAV_HIDDEN_FEATURES_EXPOSED` · `V3_NAV_BREADCRUMB` · `V3_NAV_MOBILE`

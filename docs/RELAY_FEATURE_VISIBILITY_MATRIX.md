# RELAY FEATURE VISIBILITY MATRIX — FINAL

> **Superseded for navigation entry points (2026-11-07).** The canonical IA is
> `src/lib/navigation/relay-shell-nav.ts` (domains, secondary rail, role
> visibility, mobile). This matrix is kept for feature-level traceability; the
> NAV / RAIL / MOBILE / PAL / CREATE columns are now derived from the nav config.

**Authority:** reconciled `release-merge` @ `f833833`.
Entry points: **NAV** (primary domain) · **RAIL** (secondary) · **MOBILE** ·
**PAL** (command palette) · **CREATE** (global create) · **BELL** · **PROFILE** ·
**BACK** · **INAPP** (in-page link).

Roles: **R** = Rep · **M** = Manager · **A** = Admin · **O** = Owner.

| Feature | Route | R | M | A | O | NAV | Other entries | PAL | Status |
|---|---|---|---|---|---|---|---|---|---|
| Home | `/dashboard` | ✅ | ✅ | ✅ | ✅ | Home | MOBILE | — | V |
| Prospects | `/prospect` | ✅ | ✅ | ✅ | ✅ | Sales | CREATE, INAPP | ✅ | V |
| Leads | `/leads` | ✅ | ✅ | ✅ | ✅ | Sales | MOBILE, INAPP | ✅ | V |
| Pipeline | `/leads?view=pipeline` | ✅ | ✅ | ✅ | ✅ | Sales | INAPP view toggle | — | V |
| Import Leads | `/leads/import` | ✅ | ✅ | ✅ | ✅ | Sales | — | — | V |
| Companies | `/accounts` | — | — | ✅ | ✅ | Sales | INAPP | ✅ | V |
| Upwork | `/upwork` | ✅ | ✅ | ✅ | ✅ | Sales | INAPP, CREATE | ✅ | V |
| Add Upwork job | `/upwork/new` | ✅ | ✅ | ✅ | ✅ | — | CREATE, INAPP | ✅ | V |
| Email workspace | `/revenue/email` | ✅ | ✅ | ✅ | ✅ | Sales | — | — | V |
| Lead 360 | `/leads/[id]` | ✅ | ✅ | ✅ | ✅ | — | INAPP rows, BACK | — | V (scope-checked) |
| Inbox | `/chats` | ✅ | ✅ | ✅ | ✅ | Inbox | MOBILE | ✅ | V |
| Needs reply | `/chats?view=waiting_me` | ✅ | ✅ | ✅ | ✅ | Inbox | — | ✅ | V |
| Waiting | `/chats?view=waiting_them` | ✅ | ✅ | ✅ | ✅ | Inbox | — | — | V |
| Follow-ups | `/chats?view=followups` | ✅ | ✅ | ✅ | ✅ | Inbox | — | ✅ | V |
| Meeting requests | `/chats?view=meeting_requests` | ✅ | ✅ | ✅ | ✅ | Inbox | — | — | V |
| Proposal requests | `/chats?view=proposal_requests` | ✅ | ✅ | ✅ | ✅ | Inbox | — | — | V |
| Closed | `/chats?view=closed` | ✅ | ✅ | ✅ | ✅ | Inbox | — | — | V |
| Inbound desk | `/inbound` | ✅ | ✅ | ✅ | ✅ | — | INAPP, deep link | ✅ | V |
| Tasks | `/tasks` | ✅ | ✅ | ✅ | ✅ | Work | MOBILE, CREATE | ✅ | V |
| Today / Overdue / Upcoming / Completed | `/tasks?view=…` | ✅ | ✅ | ✅ | ✅ | Work | PAL | ✅ | V |
| Team Overview | `/team` | — | ✅ | ✅ | ✅ | Team | MOBILE, INAPP | ✅ | V |
| People | `/team/people` | — | ✅ | ✅ | ✅ | Team | INAPP | — | V |
| Workload | `/team/workload` | — | ✅ | ✅ | ✅ | Team | INAPP | — | V |
| Team Activity | `/team/activity` | — | ✅ | ✅ | ✅ | Team | INAPP | ✅ | V |
| Team Performance | `/team/performance` | — | ✅ | ✅ | ✅ | Team | INAPP | ✅ | V |
| Targets | `/team/targets` | — | ✅ | ✅ | ✅ | Team | PAL | ✅ | V |
| Groups | `/team/groups` | — | ✅ | ✅ | ✅ | Team | — | — | V |
| Rep 360 | `/team/[repId]` | — | ✅ | ✅ | ✅ | — | INAPP team rows, BACK | — | V (scope-checked) |
| Daily Operations | `/admin/command` | — | ✅ | ✅ | ✅ | Team | PAL, ADMINHOME | ✅ | V |
| Command Center | `/admin/command` | — | — | ✅ | ✅ | Admin | PAL, ADMINHOME | ✅ | V |
| Studio | `/content` | ✅ | ✅ | ✅ | ✅ | Content | CREATE, INAPP | ✅ | V |
| Ideas | `/content/ideas` | ✅ | ✅ | ✅ | ✅ | Content | INAPP | ✅ | V |
| Create Post | `/studio/drafts/new` | ✅ | ✅ | ✅ | ✅ | — | INAPP Studio/Ideas, CREATE | ✅ | V |
| Growth | `/content/growth` | — | — | ✅ | ✅ | Content | — | ✅ | V |
| Sales Insights | `/reports/sales` | ✅ | ✅ | ✅ | ✅ | Insights | MOBILE, INAPP | ✅ | V |
| Pipeline Report | `/reports/pipeline` | ✅ | ✅ | ✅ | ✅ | Insights | — | — | V |
| Team Report | `/reports/team` | ✅ | ✅ | ✅ | ✅ | Insights | — | — | V |
| Revenue Report | `/reports/revenue` | ✅ | ✅ | ✅ | ✅ | Insights | — | — | V |
| AI Usage | `/admin/ai-usage` | — | — | ✅ | ✅ | Insights | settings, ADMINHOME | — | V |
| Revenue Intelligence | `/admin/revenue-intelligence` | — | — | ✅ | ✅ | Insights | INAPP | ✅ | V |
| People & Roles | `/admin/people` | — | — | ✅ | ✅ | Admin | CREATE, ADMINHOME | ✅ | V |
| Profiles | `/profile-intelligence` | — | — | ✅ | ✅ | Admin | PROFILE, INAPP | ✅ | V |
| Scoring QA | `/admin/scoring-qa` | — | — | ✅ | ✅ | Admin | — | — | V |
| QA & Trust | `/admin/qa` | — | — | ✅ | ✅ | Admin | — | — | V |
| Dataset | `/admin/dataset` | — | — | ✅ | ✅ | Admin | — | — | V |
| Training Data | `/admin/training-data` | — | — | ✅ | ✅ | Admin | — | — | V |
| Manage Profiles | `/manage-profiles` | — | — | — | ✅ | Admin | ONB, ADMINHOME | — | V |
| Settings | `/settings` | ✅ | ✅ | ✅ | ✅ | Settings | MOBILE (More), PAL | ✅ | V |
| Notifications | `/notifications` | ✅ | ✅ | ✅ | ✅ | Settings | BELL | — | V |
| Notifications | `/notifications` | ✅ | ✅ | ✅ | ✅ | — | BELL | — | V |
| My performance | `/performance` | ✅ | ✅ | ✅ | ✅ | — | INAPP | — | V |

**V** = discoverable through at least one entry point. No legitimate capability
requires typing its URL.

### Superseded routes (kept as redirects)

| Legacy | Canonical |
|---|---|
| `/conversations` | `/chats` |
| `/content-v2/growth` | `/content/growth` |
| `/content-v2/[id]/today` | `/content?persona=<id>` |
| `/team/tasks` | `/tasks?scope=team` |
| `/inbound`, `/relay` | deep-link into `/chats` |
| `/reports/pipeline`, `/reports/team`, `/reports/activity`, `/reports/revenue` | `/leads?view=pipeline`, `/team/performance`, `/team/activity`, `/admin/revenue-intelligence` |

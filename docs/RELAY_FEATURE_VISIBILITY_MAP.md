# RELAY FEATURE VISIBILITY MAP

**Status:** Phase 3 + Phase 4 complete (static analysis). Runtime crawl pending (Phase 37).
**Hard gate:** every legitimate user-facing capability has at least one discoverable entry point.

Legend: **V** = discoverable today · **H** = exists but hidden · **P** = partial (reachable only by deep link) · **—** = does not exist

Entry points: **NAV** (sidebar) · **MOBILE** · **PAL** (command palette) · **CREATE** (global create) · **BELL** · **PROFILE** · **BACK** · **INAPP** (in-page link) · **ADMINHOME** · **ONB**

---

## 1. Feature × entry point matrix (post Phase 4)

| Feature | Role | Route | NAV | Other | Status |
|---|---|---|---|---|---|
| Prospect analysis | Rep+ | `/prospect` | ✅ Sales → Prospects | PAL, CREATE | **V** |
| Lead creation (manual) | Rep+ | `/leads/new` | — | PAL, CREATE, INAPP | **V** |
| Lead creation (import) | Rep+ | `/leads/import` | ✅ Sales → Import Leads | — | **V** |
| Lead list | Rep+ | `/leads` | ✅ Sales → Leads | PAL, MOBILE | **V** |
| Pipeline board | Rep+ | `/leads?view=pipeline` | ✅ Sales → Pipeline | INAPP view toggle | **V** |
| Lead 360 | Rep+ | `/leads/[id]` | — | INAPP rows, drawer, BACK | **P** |
| Inbox / conversations | Rep+ | `/chats` | ✅ Inbox + 6 queue views | PAL, MOBILE | **V** |
| Needs reply | Rep+ | `/chats?view=waiting_me` | ✅ Inbox → Needs reply | PAL | **V** |
| Waiting on them | Rep+ | `/chats?view=waiting_them` | ✅ Inbox → Waiting on them | — | **V** |
| Follow-ups | Rep+ | `/chats?view=followups` | ✅ Inbox → Follow-ups | PAL | **V** |
| Meeting requests | Rep+ | `/chats?view=meeting_requests` | ✅ Inbox → Meeting requests | — | **V** |
| Proposal requests | Rep+ | `/chats?view=proposal_requests` | ✅ Inbox → Proposal requests | — | **V** |
| Closed | Rep+ | `/chats?view=closed` | ✅ Inbox → Closed | — | **V** |
| Inbound desk | Rep+ | `/inbound` | — | PAL, INAPP `/archive` | **P** |
| Tasks | Rep+ | `/tasks` | ✅ Work → Tasks + 4 views | PAL, CREATE, MOBILE | **V** |
| Today / Overdue / Upcoming / Completed | Rep+ | `/tasks?tab=…` | ✅ Work secondary | PAL | **V** |
| Rep 360 | Mgr+ | `/team/[repId]` | ✅ Team (via People) | INAPP team rows | **V** |
| Team performance | Mgr+ | `/team/performance` | ✅ Team → Performance | PAL | **V** |
| Team targets | Mgr+ | `/team/targets` | ✅ Team → Targets | — | **V** |
| Teams / groups | Mgr+ | `/team/groups` | ✅ Team → Groups | — | **V** |
| Team activity | Mgr+ | `/team/activity` | ✅ Team → Activity | PAL | **V** |
| Team tasks | Mgr+ | `/team/tasks` | ✅ Team → Team Tasks | PAL | **V** |
| Daily Operations | Mgr | `/admin/command` | ✅ Team → Daily Operations | PAL, ADMINHOME | **V** |
| Command Center | Admin | `/admin/command` | ✅ Admin → Command Center | PAL, ADMINHOME | **V** |
| Studio (canonical) | Rep+ | `/content` → `/content-v2/[id]/today` | ✅ Content → Studio | PAL, CREATE | **V** |
| Content identity create | Rep+ | `/content/new` | — | INAPP `/content?manage=1` | **P** |
| Growth engine | Admin | `/content-v2/growth` | ✅ Content → Growth | PAL | **V** |
| Upwork jobs | Rep+ | `/upwork` | ✅ Sales → Upwork | PAL | **V** |
| Upwork add job | Rep+ | `/upwork/new` | — | PAL, CREATE, INAPP `/upwork` | **V** |
| Upwork proposals | Rep+ | `/upwork/[id]` | — | INAPP `/upwork`, BACK | **P** |
| Direct Apply | Rep+ | — | — | — | **—** not verified as a first-class surface |
| Email workspace | Rep+ | `/revenue/email` | ✅ Sales → Email | — | **V** |
| Reports home | Rep+ | `/reports/sales` | ✅ Insights → Sales Insights | PAL, MOBILE | **V** |
| AI usage | Admin | `/admin/ai-usage` | ✅ Insights → AI Usage | settings, ADMINHOME | **V** |
| Revenue intelligence | Admin | `/admin/revenue-intelligence` | ✅ Insights → Revenue Intelligence | PAL | **V** |
| My performance | Rep+ | `/performance` | — | INAPP `/accountability` | **P** |
| Profiles (intelligence) | Admin | `/profile-intelligence` | ✅ Admin → Profiles | PAL, PROFILE | **V** |
| Manage profiles | Owner | `/manage-profiles` | ✅ Admin → Manage Profiles | ONB, ADMINHOME | **V** |
| People & Roles | Admin | `/admin/people` | ✅ Admin → People & Roles | PAL, CREATE, ADMINHOME | **V** |
| Scoring QA | Admin | `/admin/scoring-qa` | ✅ Admin → Scoring QA | — | **V** |
| QA & trust | Admin | `/admin/qa` | ✅ Admin → QA & Trust | — | **V** |
| Dataset center | Admin | `/admin/dataset` | ✅ Admin → Dataset | — | **V** |
| Training data | Admin | `/admin/training-data` | ✅ Admin → Training Data | — | **V** |
| Facts / proof | Admin | `/facts` | — | PAL "Proof" | **P** |
| Accounts (companies) | Admin | `/accounts` | ✅ Sales → Companies | PAL | **V** |
| Notifications | Rep+ | `/notifications` | — | BELL | **V** |
| Settings | Rep+ | `/settings` | ✅ Settings | PAL, MOBILE(More) | **V** |
| Assigned profiles | Rep+ | `/rep/assigned-profiles` | — | PAL "Switch profile", notification | **P** |
| Archive | Rep+ | `/archive` | — | PAL, INAPP `/inbound` | **P** |

---

## 2. Gate result

**PASS.** Every formerly hidden feature now has a navigation entry point:

| Formerly hidden | New entry point |
|---|---|
| `/leads/import` | Sales → Import Leads |
| `/upwork` | Sales → Upwork |
| `/upwork/new` | Global Create + page |
| `/team/targets` | Team → Targets |
| `/team/groups` | Team → Groups |
| `/content-v2/[id]/today` | Content → Studio |
| `/content-v2/growth` | Content → Growth |
| `/admin/scoring-qa` | Admin → Scoring QA |
| `/admin/qa` | Admin → QA & Trust |
| `/admin/dataset` | Admin → Dataset |
| `/admin/training-data` | Admin → Training Data |
| `/admin/ai-usage` | Insights → AI Usage |
| `/manage-profiles` | Admin → Manage Profiles (owner) |
| `/revenue/email` | Sales → Email |

Still partial (reachable by in-page link or palette only — acceptable under the gate,
which allows NAV / CMD-K / GLOBAL CREATE / IN-CONTEXT LINK):

`/leads/[id]`, `/inbound`, `/content/new`, `/upwork/[id]`, `/performance`,
`/facts`, `/rep/assigned-profiles`, `/archive`.

---

## 3. Duplicate destinations to collapse (canonical + legacy)

| Concept | Canonical | Legacy | Plan |
|---|---|---|---|
| Pipeline | `/leads?view=pipeline` | `/reports/pipeline` | redirect legacy → canonical |
| Team performance | `/team/performance` | `/reports/team` | redirect legacy → canonical |
| Team activity | `/team/activity` | `/reports/activity` | redirect legacy → canonical |
| Revenue | `/admin/revenue-intelligence` | `/reports/revenue` | redirect legacy → canonical |
| Profiles | `/profile-intelligence` | `/profiles`, `/manage-profiles` | merge |
| Growth | `/content-v2/growth` | `/admin/growth` | redirect legacy → canonical |
| Command Center | `/admin/command` | `/admin`, `/admin/command-center` | already redirects |
| Conversations | `/chats` | `/relay`, `/inbound` | merge into Inbox views |
| Daily Operations | `/admin/command` | — | Team label for managers, Admin label for admins |

---

## 4. Not verified here (needs runtime crawl)

- Whether `/upwork/[id]` exposes Direct Apply as a first-class action.
- Whether the notification deep links resolve.
- Role matrix enforcement per route (Phase 23).

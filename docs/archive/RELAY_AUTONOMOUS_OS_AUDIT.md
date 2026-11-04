# Relay — Autonomous Revenue OS: Phase 1 Audit

**Date:** 2026-10-30
**Scope:** every page route, API route, table, lib domain and scheduled job in this repo.
**Method:** source reading, not inference. Every claim below cites the file or table it
came from. Nothing was edited to produce this document.

---

## 0. Executive verdict

Relay is **not** a lead-scoring tool waiting for humans. It already contains a
prioritised action queue, a conversation engine, a follow-up clock, an
accountability system with daily targets and day-close records, 8 live job
providers, an email sending policy layer, and a command centre. Roughly two
thirds of the operating model in the brief already exists in some form.

What it does **not** have is the thing that makes those parts feel like one
system: **a single, organisation-local operating day that a rep can start,
work, fall behind in, and close.** Today is computed from UTC, the workday
window is hardcoded 9–17, "the rep's day" is scattered across one row per
revenue identity, there is no check-in, and no scheduler evaluates warnings or
resets anything. That is the gap — not missing features, missing spine.

Three structural problems, in order of cost:

1. **The day has no owner.** `today` is `new Date().toISOString().slice(0,10)`
   in every accountability path. The workday is `DEFAULT_WORKING_DAY = {9,17,'UTC'}`.
   `organizations.timezone` exists but never reaches the day boundary.
2. **"Today" is four surfaces, not one.** `/dashboard`, `/relay`, `/accountability`
   and `/api/rep/today` each compute a different partial answer.
3. **Nothing runs unless someone loads a page.** All 5 crons are fixed-UTC and
   none of them evaluate warnings, reset a day, or close one.

---

## 1. Evidence base

| Measure | Value |
|---|---|
| Page routes | 88 |
| API route handlers | 205 |
| Tables | 117 |
| Migrations | 135 |
| Test files | 235 (4,016 tests, 0 failing as of `d99a018`) |
| Scheduled jobs (`vercel.json`) | 5, all fixed-UTC |
| Primary nav items | 4 + 19 in a "More" drawer |
| Accountability lib | 3 files (`default-targets`, `metrics`, `target-overview`) |
| Relay decision lib | 45 files (`src/lib/relay`) |

---

## 2. KEEP — real, load-bearing, do not rebuild

| Capability | Where | Why it survives |
|---|---|---|
| Next-best-action ranking | `src/lib/relay/next-best-action.ts`, `queue-engine.ts` | Pure, deterministic, already ranks replies above cold work. The brief's Phase 32 is this file. |
| Lead state machine | `src/lib/relay/lead-state-machine.ts` | Event-driven stage progression; the contract the last sprint protected. |
| Follow-up clock | `src/lib/conversation/follow-up-policy.ts` | Single canonical clock, already collapsed from three copies. |
| Conversation classification | `src/lib/relay/conversation-engine.ts`, `conversation/intent.ts` | Real inbound classification and reply strategy. |
| Sales thesis | `src/lib/relay/revenue-strategy.ts`, table `thesis_evaluations` | Thesis is generated and stored per lead. |
| Daily targets | tables `daily_targets`, `accountability_templates`; page `/admin/targets` | Per rep × identity × activity, with org templates. |
| Day close + exceptions | tables `day_closes`, `operator_availability`; `/api/accountability/day-close*` | Immutable snapshot, exception enum, reviewer stamp. This is Phase 43/15 already. |
| Warnings | `src/lib/relay/warning-service.ts` | Deterministic levels `early/midday/late/very_late/ready` with dedupe keys. |
| Email safety | tables `email_sending_policies`, `email_suppressions`, `email_send_attempts`, `email_delivery_events`; `src/lib/email/service.ts` | Daily cap, min delay, send window, timezone, follow-up limit, idempotency. Phase 21 exists. |
| Job providers | `src/lib/jobs/providers/*` — Adzuna, Remotive, RemoteOK, Himalayas, Jobicy, Arbeitnow, The Muse, USAJobs | 8 real adapters with `normalize` / `deduplicate` / `filter` / `rank`. Phase 22's plumbing already exists. |
| Notifications | table `notifications`, `notification_log`, `push_subscriptions`, `notification-center.tsx` | Dedupe key, read state, push. |
| Multi-tenancy | `organization_id` + RLS on all tables; `scopeLeadsToWorkspace()` | Verified cross-profile in BUG-30. |
| Observability | `ai_traces`, `relay_events`, `action_events`, `/api/admin/observability` | Trace + ledger already durable and idempotent. |
| Test infrastructure | 235 files / 4,016 tests, contracts gate | The safety net that makes this program affordable. |

---

## 3. SIMPLIFY / MERGE — real but duplicated or fragmented

| Surface | Problem | Disposition |
|---|---|---|
| `/dashboard`, `/relay`, `/accountability`, `/api/rep/today`, `/api/rep/my-day`, `/api/relay/queue` | Six entry points answer "what do I do now" with different subsets | **Merge into one Today**; keep the APIs as internal loaders. |
| `/dashboard` role branches | `AdminDashboard`, `ManagerTodayView`, `RepWorkspace` + analytics all render on one route | **Split by role into Today (rep) and Command (admin)**; delete the manager branch. |
| `/admin`, `/admin/command-center`, `/admin/accountability`, `/admin/activity`, `/admin/people`, `/admin/rep-day`, `/admin/targets` | Seven pages answer "who is behind" | **Merge into Command + People**; targets moves to Settings. |
| `daily_accountability` (per identity) vs `day_closes` (per identity) vs brief's "one rep day" | The rep's day is N rows across N identities; there is no aggregate | **Aggregate into `rep_day`**; keep identity rows as the detail behind it. |
| `computeStatus`, `computeCategoryStatus`, `computeOverallStatus`, `needsAttention`, `dayProgress`, `workingMinutesRemaining` | Six overlapping status functions, three different tolerance formulas | **One pacing function**; the rest become thin wrappers or die. |
| `/upwork`, `/api/upwork/*` vs `/leads` queue | Two opportunity pipelines with separate ranking | **One ranking surface**, Upwork as a channel inside it. |
| `profile-intelligence` vs `/prospect` vs `/leads/import` vs `/inbound` | Four ingestion doors, no shared queue | **One Sources page** over the same ingestion APIs. |
| Nav "More" drawer | 19 items, 8 groups, mixes Work / Create / Intelligence / Admin | **8 primary destinations**, admin extras behind a role gate. |

---

## 4. REMOVE — dead or unreachable, with evidence

| Item | Evidence |
|---|---|
| `src/lib/relay/reply-intelligence.ts` | zero references in `src`, `tests`, `e2e` |
| `src/lib/relay/funnel.ts` | imported only by `tests/revenue-loop.test.ts` — no product caller |
| `src/lib/relay/thread-status.ts` | imported only by `tests/relay-canonical-action-fixes.test.ts` |
| `src/lib/relay/message-forge.ts` | imported only by tests; the live draft path is `src/lib/ai/draft.ts` + `conversation/composer.ts` |
| `/relay/persona-daily` | 0 inbound references |
| `/admin/growth` | 0 inbound references; superseded by `/content-v2/growth` |
| `/admin/activity` | 0 inbound references |
| `docs/RELAY_PRODUCT_SIMPLIFICATION_PLAN.md` §1–4 | Already-written deletion plan that was never executed. Execute it rather than re-auditing. |

The simplification plan already enumerates ~10 dead routes, ~15 dead components
and ~10 dead lib modules with per-item import evidence. It was reviewed on
2026-10-24 and never implemented. **This audit endorses it; it does not replace
it.**

---

## 5. REPLACE — built, but pointed at the wrong problem

| Item | What it is now | What the brief needs |
|---|---|---|
| `src/lib/jobs` ("Find Jobs") | CV → job listings, for **the rep's own job search**: `buildCvProfile`, `scoreJob`, `/api/jobs/cv`, `/api/resume/generate`, table `tailored_cvs` | **Buyer-intent radar**: a company hiring 4 React engineers is a capacity-demand signal for *our* services. The adapters are reusable; the framing, scoring and destination are not. |
| `commercial-episodes.ts` | Commercial-potential episode builder, called only from `intelligence-v3/orchestrator.ts`; **no persisted episode table** | Phase 27 wants episodes as first-class, expiring, queryable records that Today ranks. |
| `upwork_applications` table | Dead schema — never read or written by `src` | Remove, or fold into `upwork_jobs`. |
| `isWorkingDay(date, workingDays)` | `date.getDay()` on a UTC `Date` — wrong weekday near midnight in any non-UTC org | Org-local weekday resolution. |

---

## 6. Phase gap matrix

`EXISTS` = shipped and used · `PARTIAL` = real code, incomplete contract ·
`MISSING` = no implementation.

| Phase | Status | Evidence / gap |
|---|---|---|
| 1 Audit | **DONE** | this document |
| 2 IA | PARTIAL | 4 primary + 19 "More"; target is 8 |
| 3 Org operating clock | **MISSING** | `organizations` has `timezone`, `working_days`, `holidays` only. No `workday_start/end`, no `daily_reset_time`. `dayProgress()` hardcodes 9–17. |
| 4 Daily reset | **MISSING** | no `organization_day`, no `rep_day`, no reset worker |
| 5 Daily targets | EXISTS | `daily_targets`, `accountability_templates`, `/admin/targets` |
| 6 Rep day state machine | PARTIAL | `computeOverallStatus` yields `on_track/at_risk/completed/missed`; `day_closes.status` adds `not_started/in_progress/ready_to_close/completed_with_exception`. No `CRITICAL`, no single rep-level state. |
| 7 Pacing | PARTIAL | `computeCategoryStatus` paces per category, per identity; thresholds hardcoded; no rep-level pace |
| 8 Accountability language | PARTIAL | `warning-service` messages exist; no "time remaining + actions remaining" copy |
| 9 Escalation engine | PARTIAL | warnings computed **on request**; nothing schedules them |
| 10 Admin visibility | PARTIAL | 7 pages, no single "who is behind" answer |
| 11 New Today | PARTIAL | `RepWorkspace` + `rankNextActions`; commitments are per identity |
| 12 Day progress | PARTIAL | `today-counts.ts`, `pipeline-analytics` |
| 13 Check-in | **MISSING** | no `check_in` column anywhere; `operator_availability` is a leave flag, not a check-in |
| 14 Check-out | PARTIAL | day-close routes exist; no shortfall narrative, no roll-forward |
| 15 Exceptions | EXISTS | `day_closes.exception_reason` enum + `reviewed_by/at`; `operator_availability` |
| 16 Sources page | **MISSING** | no `/sources`; ingestion split across 4 doors |
| 17 LinkedIn ingestion | EXISTS | `profile_sources`, `profile_experience`, `/api/prospect/analyze`, `/api/profile-intelligence/*` |
| 18 Sourcing assignments | PARTIAL | `identity_assignments`, `profile_assignments`; no "collect 25 profiles → submitted/accepted/qualified" task type |
| 19 Email sourcing | PARTIAL | `/leads/import`, `csv_imports`; no validation/enrichment queue |
| 20 Email autopilot | PARTIAL | send service + drafts exist; no explicit state enum, no scheduler |
| 21 Email safety | EXISTS | caps, delays, window, timezone, suppression, bounce events |
| 22 Job radar | REPLACE | 8 providers exist, aimed at the rep's career |
| 23 Freshness | **MISSING** | no `observed_at` / `freshness_class` / `expires_at` |
| 24 Job intelligence | **MISSING** | no employee-hiring vs contract vs agency classification |
| 25 Execution levels | PARTIAL | Upwork is human-apply; no `AUTO_*` model |
| 26 Upwork in engine | PARTIAL | `upwork_jobs` + `APPLY_UPWORK` action; separate ranking |
| 27 Opportunity episodes | PARTIAL | `commercial-episodes.ts` exists, not persisted, single caller |
| 28 Demote score | PARTIAL | display-score exists; score still prominent |
| 29 Sales thesis | PARTIAL | `revenue-strategy.ts`, `thesis_evaluations` |
| 30 Message engine | PARTIAL | `message-forge.ts` is test-only; live path is `ai/draft.ts` |
| 31 Message strategy | PARTIAL | `outreach-strategy.ts` |
| 32 Next best action | EXISTS | `next-best-action.ts`; type names differ from the brief |
| 33 Priority | EXISTS | `rankNextActions` ordering |
| 34 Conversation engine | PARTIAL | `conversation-engine.ts` live; `reply-intelligence.ts` orphaned |
| 35 Autonomy levels | **MISSING** | no autonomy concept in code or schema |
| 36 Opportunity learning | PARTIAL | `scoring_feedback`, `edit_learning`, `sales_memory`, `historical-outcomes` |
| 37 Revenue metrics | PARTIAL | `analytics/pipeline-analytics`, `/admin/revenue-intelligence` |
| 38 Team performance | EXISTS | `rep-performance.ts`, `/admin/performance`, `/team/[repId]` |
| 39 Admin command centre | PARTIAL | `command-center-v2` exists; not the 8-question model |
| 40 Warnings | EXISTS | `warning-service.ts` |
| 41 Admin escalations | **MISSING** | notifications are recipient-scoped only |
| 42 Notifications | EXISTS | table + centre + push + dedupe |
| 43 Close day | EXISTS | `/api/accountability/day-close`, `-strict`, `ensure-day-close` |
| 44 Next-day planning | **MISSING** | no carryover/roll-forward |
| 45 Background workers | **MISSING** | 5 fixed-UTC crons; none operational |
| 46 Failure safety | PARTIAL | `action_events` idempotency, `rate_limits`, `ai_traces`; no dead-letter |
| 47 Observability | EXISTS | `ai_traces`, `relay_events`, `/admin/observability` |
| 48 Multi-tenancy | EXISTS | RLS + `organization_id` everywhere |
| 49 Performance | PARTIAL | `dashboard` parallelises; `/api/rep/my-day` is a serial waterfall |
| 50 Mobile | PARTIAL | nav collapses; rep flow unverified at 375px |
| 51 UX style | PARTIAL | design system present |
| 52 Accessibility | PARTIAL | `aria-live` added in BUG-31 |
| 53 Remove useless UI | **NOT DONE** | plan exists, unexecuted |
| 54 Migrations | EXISTS | 135 migrations with RLS + indexes |
| 55 Test strategy | EXISTS | 235 files, 4,016 tests |
| 56 Daily-ops E2E | PARTIAL | no full rep-day loop test |
| 57 Timezone E2E | **MISSING** | no timezone matrix |
| 58 Admin E2E | PARTIAL | |
| 59 Large data | PARTIAL | |
| 60 Security | PARTIAL | contracts + tenant tests; no autonomy surface to attack yet |
| 61 Autonomy safety | N/A | blocked on Phase 35 |
| 62 Release gates | PARTIAL | code/browser/DB/SHA/prod exist; timezone, daily-ops, autonomy missing |
| 63 Final prod QA | EXISTS | the BUG-23..31 closure process |

**Tally (63 phases):** 15 EXISTS · 33 PARTIAL · 11 MISSING · 1 REPLACE
(Phase 22) · 1 N/A (Phase 61, blocked on Phase 35) · 1 DONE (Phase 1) ·
1 NOT DONE (Phase 53, plan written, unexecuted).

---

## 7. The four structural gaps

### G1 — The day boundary is UTC, and the workday is hardcoded

```ts
// src/lib/relay/accountability-engine.ts
export const DEFAULT_WORKING_DAY = { startHour: 9, endHour: 17, timezone: 'UTC' }
export function dayProgress(now, timezone, config = DEFAULT_WORKING_DAY) { … }
```

Every caller passes only a timezone, so the window is always 09:00–17:00 in
that zone. `organizations` has no `workday_start` / `workday_end`, so the real
org cannot configure 09:00–18:00 Asia/Karachi as the brief requires.

Every accountability query derives the date the same way:

```ts
const today = new Date().toISOString().slice(0, 10)   // UTC date
```

For an org in Asia/Karachi that is the wrong calendar day between 00:00 and
05:00 local. `isWorkingDay()` calls `date.getDay()` on that UTC instant, so
the weekday is also wrong in that window.

**Cost of not fixing:** every Phase 4/6/9/43/57 requirement inherits the bug,
and the timezone E2E gate can never pass.

### G2 — "The rep's day" is not a record

`daily_accountability` is unique on
`(rep_id, revenue_identity_id, activity_type, target_date)`.
`day_closes` is unique on `(person_id, revenue_identity_id, date)`.

So a rep assigned to 4 identities has 4×N target rows and 4 close records, and
"62% of today's commitment complete" must be recomputed by summing across
identities on every page load. There is no row that says *this rep, this day,
this state, these minutes remaining, this shortfall*.

That is why Today cannot show one commitment bar, and why "who is critical"
requires opening seven admin pages.

### G3 — Four Today surfaces, seven admin surfaces

| Rep question | Answered by |
|---|---|
| What do I do next? | `/dashboard` → `RepWorkspace`, `/relay` → queue, `/api/rep/today` |
| How am I doing? | `/accountability`, `warning-service` |
| What did I close? | `/api/accountability/day-close` |

Each computes its own partial state. There is no single loader, so they can
disagree — and they do, because they use different date and status functions.

### G4 — Nothing is scheduled

`vercel.json` has five crons: few-shot refresh, eval, reconcile, archive-stale,
trends ingest. **None** of them evaluate warnings, reset a day, close a missed
day, schedule a follow-up, or send a queued email.

So "Relay warns you at 15:00" is not true today. A warning exists only if the
rep happens to load a page after 15:00. Phase 9, 20, 44 and 45 are all blocked
on the same missing worker.

### G5 — The job radar is aimed at the wrong customer

`src/lib/jobs` is a competent job-search engine: 8 providers, CV parsing,
normalisation, dedupe, AI match, `tailored_cvs`. It answers *"where should I
work?"* The brief needs *"which company just signalled capacity demand?"*

The adapters, normaliser and dedupe are exactly what Phase 22 asks for. The
scoring, the UI (`/api/jobs/cv`, `/api/resume/generate`) and the destination
are a different product.

---

## 8. Decisions that are yours, not mine

These change what gets built, so I am not deciding them silently.

**D1 — Does Relay keep the job-seeker product?**
`/api/jobs/search`, `/api/jobs/cv`, `/api/resume/generate`, `tailored_cvs`.
If it stays, it is a second product inside Relay and needs its own nav slot.
If it goes, its 8 providers get repointed at buyer intent and ~3 routes die.
*Recommendation: repoint. It is the same adapters and it serves the north star.*

**D2 — Is accountability per identity or per rep?**
Today it is per identity, because targets are attached to revenue-identity
contracts. The brief describes one daily commitment per rep.
*Recommendation: `rep_day` aggregates identity rows. Do not delete the
identity detail — contracts and allocations are real commercial data.*

**D3 — What is bpulse's real operating policy?**
Timezone, workday start/end, working days, reset time, and the default target
pack. I can seed `Asia/Karachi 09:00–18:00, Mon–Fri` but that is a guess.

**D4 — Which channels may run without approval at launch?**
The brief suggests email `AUTOPILOT`. That means real outbound mail with no
human in the loop, gated only by `email_sending_policies`.
*Recommendation: `APPROVAL_REQUIRED` everywhere at launch; promote email to
autopilot only after a week of clean bounce and opt-out data.*

**D5 — Does Content Studio stay?**
It is 384K of lib and ~30 routes, is not in the 8-item nav, and does not
appear in the operating loop. Keep, park behind a flag, or remove?

**D6 — Sequencing.** The increments in §9 are ordered by dependency. Confirm
the order, or tell me which one matters first.

---

## 9. Proposed build order

Each increment is independently shippable, testable and reversible. No
increment touches the release branch until its gate passes.

| # | Increment | Phases | Why first |
|---|---|---|---|
| I1 | **Org operating clock** — `organization_operating_policy`, org-local day boundary, one `orgToday()` / `orgWeekday()` / `workdayWindow()` module, replace every UTC `today` | 3, 4, 57 | Everything else derives dates from it. Doing this later means rewriting every increment. |
| I2 | **Rep day** — `rep_day` + `organization_day` tables, one state machine (`NOT_STARTED → ACTIVE → AT_RISK → CRITICAL → READY_TO_CLOSE → CLOSED / MISSED`), check-in, one pacing function, one Today loader | 6, 7, 11, 12, 13, 14, 40 | This is the product's spine and the brief's central promise. |
| I3 | **Scheduler** — durable worker for reset, warning evaluation, escalation, follow-up due, missed-day close; idempotent, dead-lettered | 9, 41, 44, 45, 46 | Without it, accountability is advisory only. |
| I4 | **Command centre** — one admin answer to the 8 questions; merge the 7 admin pages | 10, 39 | Depends on I2's rep-day state. |
| I5 | **Sources** — one ingestion surface over the 4 existing doors + sourcing assignments with submitted/accepted/qualified | 16, 18, 19 | Turns manual sourcing into managed input. |
| I6 | **Job radar → opportunity engine** — repoint providers at buyer intent, add freshness + hiring-type classification, feed `rankNextActions` | 22, 23, 24, 25, 26 | Reuses I1–I3; does not block the spine. |
| I7 | **Autonomy + email** — autonomy levels per org/channel, email state machine, queued send | 20, 35, 61 | Last, because it is the only increment that can contact a stranger unattended. |

Removals (§4) ride along with whichever increment touches that area, so the
diff stays honest.

---

## 10. Non-goals for this program

- Rebuilding scoring. It is demoted, not replaced (Phase 28).
- Rebuilding the message composer. `ai/draft.ts` is live and tested.
- Rebuilding email safety. It is the most complete subsystem in the repo.
- Automating LinkedIn. The brief forbids it and the current ingestion is
  paste-based by design.
- Multi-provider notification fan-out (Slack/Teams). `notifications` +
  `push_subscriptions` are enough until someone asks.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| `rep_day` duplicates `daily_accountability` and the two drift | `rep_day` is derived; identity rows stay the source. One reconciliation query, tested. |
| Changing the day boundary moves historical counts | Never rewrite past rows; `rep_day` starts at the cutover date, earlier days stay UTC-derived and are labelled. |
| Org-local dates change what "today" means for existing data | Cutover migration records the boundary; a test asserts no row moves. |
| Scheduler runs twice (Vercel retry) | Every worker keyed by `(org_id, date, kind)`; the ledger pattern from BUG-28. |
| Autopilot sends to a suppressed or terminal lead | Phase 61 gate before Phase 35 ships; existing `email_suppressions` is the enforcement point. |
| 205 API routes make refactors expensive | Increments reuse existing loaders; no route is rewritten until its increment needs it. |

---

## 12. What this audit deliberately does not do

- It does not re-list the 10 dead routes / 15 dead components in
  `RELAY_PRODUCT_SIMPLIFICATION_PLAN.md`. That work is already specified; it
  needs execution, not another audit.
- It does not estimate dates. Sequencing is by dependency, not calendar.
- It does not propose new tables beyond the four the operating loop needs
  (`organization_operating_policy`, `organization_day`, `rep_day`, plus a
  worker/outbox table), because 117 tables is already a lot of surface.

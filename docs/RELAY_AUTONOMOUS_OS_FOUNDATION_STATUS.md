# Relay Autonomous Revenue OS — Foundation Status (I1–I3)

**Date:** 2026-10-30
**Scope:** Organization Operating Clock (I1), Rep Day + Unified Today (I2),
Operational Scheduler (I3). I4–I7 are not started.

```text
BASELINE SHA    d99a018   (HEAD when this work began)
CODE SHA        933f4ce   (I1–I3; the commit that carries every change)
DEPLOYED SHA    read /api/version — see "Release record" below
```

**Release record.** A document cannot contain the SHA of the commit that adds
it: committing this file moves `HEAD`. `CODE SHA` is the implementation commit.
`DEPLOYED SHA` must be read from `/api/version` at verification time and compared
against `CODE SHA`; later commits in this program are docs/tests only.

---

## 1. I1 — Organization operating clock

### What changed

| Before | After |
|---|---|
| `DEFAULT_WORKING_DAY = {9, 17, 'UTC'}` hardcoded in TypeScript | `organization_operating_policy` per organization, seeded for the real org |
| `new Date().toISOString().slice(0, 10)` as the business date (43 call sites) | `orgDate(instant, policy.timezone)` from one module |
| `isWorkingDay()` used `date.getDay()` on a UTC instant | `orgWeekday()` / `isOrgWorkingDay()` in the organization's zone |
| `record_activity_event` wrote `target_date = current_date` (database UTC date) | accepts `p_date`, the caller's organization-local business date |
| `toLocaleString(...)` re-parsed as server-local to recover an offset | zone-offset resolution with DST correction |

### The time authority — `src/lib/org-clock`

`orgNow` · `orgDate` · `orgToday` · `orgWeekday` · `workdayWindow` ·
`isOrgWorkingDay` · `workdayProgress` · `minutesRemaining` ·
`minutesUntilWorkdayStart` · `isBeforeWorkday` · `isWithinWorkday` ·
`isAfterWorkday` · `nextOperatingDay` · `previousOperatingDay` ·
`businessDateRange` · `zonedWallClockToUtc` · `formatDuration`.

Pure functions take `now` and a policy. The only place the wall clock is read is
`src/lib/org-clock/clock.ts`, which also hosts the test clock (see §10).

### Organization policy

`organization_operating_policy` — one row per organization:

```text
timezone · workday_start · workday_end · working_days · daily_reset_time
warning_thresholds · target_pack · cutover_date · created_at · updated_at
```

Constraints: timezone non-empty, `workday_start < workday_end`, working days a
non-empty subset of 0–6. RLS: members read their organization; admins write.

Seeded for the real organization exactly as specified:

```text
Asia/Karachi · 09:00–18:00 · Mon–Fri · reset 00:00 local
targets: 25 profiles · 20 emails · 15 jobs · 8 qualified · 15 outbound · 10 follow-ups · 100% replies
```

Every other organization receives a policy derived from what it already
declares, so no organization is left without a clock.

### Cutover

`cutover_date` marks the first business date the organization-local boundary is
authoritative. **No historical row is reinterpreted.** `daily_accountability`,
`day_closes` and `monthly_accountability_reviews` keep the dates they were
written with. `rep_day` begins at cutover. Days before it remain UTC-derived
and are labelled as legacy in the data, not rewritten.

### Timezone matrix

All four zones are tested at midnight boundaries, weekday rollover
(Fri→Sat, Sun→Mon), workday before/inside/after, and DST start/end.

| Zone | Tested |
|---|---|
| `Asia/Karachi` (UTC+5, no DST) | local date ahead of UTC at 20:00Z; Friday 23:00Z is Saturday |
| `America/New_York` | local date behind UTC at 02:00Z; spring-forward day 23h; fall-back day 25h; 09:00–18:00 stays 9h |
| `Europe/London` | winter agrees with UTC, summer does not; 23h / 25h transition days |
| `UTC` | agrees with the UTC date at every hour |

DST specifics proven:

- `businessDateRange('2026-03-08', New_York)` = **23 hours**
- `businessDateRange('2026-11-01', New_York)` = **25 hours**
- `businessDateRange('2026-03-29', London)` = **23 hours**
- `businessDateRange('2026-10-25', London)` = **25 hours**
- a non-existent local time (02:30 on spring-forward) resolves deterministically to 03:30
- the fall-back overlap resolves to the first occurrence
- `minutesRemaining` at 12:00 local is 360 on both sides of a transition

### Architecture guard

`tests/qa-org-clock-architecture-guard.test.ts` fails the build if any module
that owns accountability reintroduces `toISOString().slice(0, 10)` or the
`toLocaleString` offset trick. Scope: `src/lib/org-clock`, `src/lib/rep-day`,
`src/lib/accountability`, `src/lib/relay/{accountability-engine,warning-service,
dashboard-loader}`, `src/lib/auth/workspace`, `src/lib/store/supabase-store`,
`src/app/api/{accountability,rep}`, and the Today page.

---

## 2. I2 — Rep day

### Model

`organization_day` — one organization-local operating day (`OPEN`/`CLOSED`),
opened and closed by the worker.

`rep_day` — one rep, one business date:

```text
state · check_in_at · closed_at · workday_progress · commitment_progress
pace_ratio · minutes_remaining · required_remaining
exception_state · exception_reason · exception_note · reviewed_by · reviewed_at
shortfall (jsonb) · carryover (jsonb)
unique (organization_id, rep_id, business_date)
```

It **aggregates** the detailed per-identity rows; it does not duplicate them.
`daily_accountability` and `day_closes` remain the attribution source and the
immutable history.

### State machine

One pure function, `deriveRepDayState()`, owns every transition:

```text
NOT_STARTED → ACTIVE → AT_RISK → CRITICAL → READY_TO_CLOSE → CLOSED
                                                         ↘ MISSED
```

| Condition | State |
|---|---|
| non-working day | `NOT_STARTED` (`applicable: false`) |
| before the workday opens | `NOT_STARTED` (`before_workday`) |
| inside the workday, no check-in | `NOT_STARTED` (`not_checked_in`) |
| checked in, pace healthy | `ACTIVE` |
| materially short after the risk threshold | `AT_RISK` |
| final quarter and far behind | `CRITICAL` |
| nothing required, or an approved exception | `READY_TO_CLOSE` |
| explicit close | `CLOSED` |
| workday ended without a close | `MISSED` |

No page decides status. The UI renders `day.state`; the scheduler derives it
with the same function.

### Pacing

`computePace()` — completed ÷ expected, where expected is the fraction of the
workday elapsed. Not "percent of the end-of-day target".

```text
pace_ratio = commitment_progress ÷ workday_progress
behindBy   = max(0, workday_progress − commitment_progress)
```

Bands are driven by configurable thresholds (defaults):
`riskStartPct 25`, `riskPaceRatio 0.8`, `criticalStartPct 75`,
`criticalPaceRatio 0.6`, `finalStartPct 90`.

Unanswered buyer replies are mandatory work: they prevent `READY_TO_CLOSE` and
push an otherwise on-pace rep to `AT_RISK` after the risk threshold. An approved
exception waives the pace entirely.

### Commitments

Seven rows, derived from real data, in a stable order:

```text
Profiles · Emails · Jobs · Qualified · Outbound · Follow-ups · Replies
```

Targets come from `daily_targets` (per rep × identity × activity), with the
organization's policy pack as the seed when a rep has no configured target.
Nothing in the code knows what "25" means.

`measured: false` is the honesty flag: a commitment with no target and no
completions is shown but excluded from the pace denominator. Today that is
`Qualified` — see Known risks.

### Check-in

`Start my day` is explicit and idempotent: the first check-in is the check-in.
A double-click, a retry or a second tab cannot move it. A concurrent insert race
is resolved by the unique key and returns the winner. On a non-working day or
before the workday opens there is no button.

### Check-out

Closing shows completed, remaining and shortfall, and offers:

- **Close my day** — only when nothing is required, or an exception is approved
- **Close incomplete** — always allowed; the shortfall is written and never erased
- **Request exception** — reason + note, reviewed by an admin

Closing twice returns the first close. The shortfall snapshot names every
outstanding commitment and the waiting replies.

### Exceptions

Reasons: `leave`, `meeting_heavy_day`, `training`, `client_call`,
`admin_override`, `technical_outage`, `other`. A rep requests; an admin or owner
approves or rejects, with `reviewed_by` and `reviewed_at`. The admin path
verifies the rep belongs to the caller's organization before writing.

### Today — before and after

| Before | After |
|---|---|
| `/dashboard`, `/relay`, `/accountability`, `/api/rep/today`, `/api/rep/my-day` each computed a partial answer | one `loadRepDay()`; the page and both APIs read it |
| state was per identity, recomputed on every load | one rep-level state, one pace, one minutes-remaining |
| no time remaining, no commitment %, no state | greeting, time remaining, commitment %, state, commitments |
| next actions ranked separately from the day | same `rankNextActions()`, now ordered by contract |

The panel renders above the existing desk; the ranked list, resume-work,
referred leads and Upwork sections are unchanged. `/api/rep/today` keeps its
legacy fields and adds the canonical `day` so existing consumers do not break.

### Next-action order

The existing engine, with one contract rule added:

1. a waiting buyer reply always first
2. a due follow-up on a live thread ahead of fresh research
3. otherwise the existing priority score

No ranking logic was rebuilt.

---

## 3. I3 — Operational scheduler

### Outbox

`operational_jobs`:

```text
organization_id · business_date · rep_id · job_kind · time_bucket
dedupe_key · state (pending/running/done/dead) · attempt · max_attempts
last_error · next_attempt_at · request_id · payload · result
locked_at · completed_at
unique (organization_id, dedupe_key)
```

RLS is enabled with **no policies**: authenticated users cannot read or write the
scheduler. The worker runs as the service role.

### Cadence

One global cron, `*/10 * * * *`, in UTC. It evaluates each organization against
its own local clock. It does not create one cron per organization.

Per organization per day, at most six jobs — the stage is the only time bucket:

```text
OPEN_DAY                       once
EVALUATE_REP_DAY               once per stage (early/midday/at_risk/final/end)
EMIT_WARNING                   once per stage
EMIT_ESCALATION + FOLLOWUP     from midday onward
CLOSE_MISSED_DAY + CARRYOVER   at end
```

### Idempotency

Planning is deterministic: `dedupe_key = businessDate:jobKind:timeBucket`.
Enqueue uses `upsert … ignoreDuplicates`. Execution claims a job with a
conditional update (`… set state='running' where id = ? and state='pending'`),
so two overlapping runs cannot execute the same job twice. Proven in
`qa-scheduler-idempotency` (planning three times produces the same key set).

### Failure handling

`attempt`, `last_error`, `next_attempt_at` (exponential, capped at 60 minutes),
`dead` after `max_attempts`, `request_id` and `result` for trace. A failing job
never stops the run and is never silently dropped.

### Warnings

The warning progression is `early → midday → at_risk → critical → final →
missed`. Notifications are written once per rep per state per day
(`warning:<date>:<rep>:<STATE>`), so a rep who oscillates does not get spammed.
Language is professional and specific: time remaining, actions remaining, and
what happens if the pace holds.

### Escalations

A rep in `CRITICAL` notifies the rep and every owner, admin and manager in the
organization, once per rep per day per recipient. The command centre link is
`/admin/command-center`. Dedupe proven in `qa-warning-escalation`.

### Missed day

At the end of the workday, any day not explicitly closed becomes `MISSED`, with
`shortfall` and `carryover` written. If the worker was down through the end of
the previous operating day, the first two hours of the next day plan the
recovery job for that previous date — same dedupe key, so it is still exactly
once.

### Next-day carryover

For every closed or missed day, the next operating day's `rep_day` row is
created with `carryover = { from, requiredRemaining, repliesWaiting,
commitments[] }`. Weekends are skipped, not treated as missed.

### Follow-ups

`EVALUATE_FOLLOWUP` counts leads waiting on a follow-up per rep and notifies
once per day. Email autopilot is deliberately not implemented (`ENQUEUE_EMAIL`
returns `skipped`).

---

## 4. Admin command data (for I4)

`loadTeamDay()` in `src/lib/rep-day/team.ts` is the one server-side contract:

```text
businessDate · timezone · isWorkingDay
counts: NOT_STARTED / ACTIVE / AT_RISK / CRITICAL / READY_TO_CLOSE / CLOSED / MISSED
totals: reps · requiredRemaining · average commitmentProgress
reps[]: repId · repName · state · checkInAt · closedAt · commitmentProgress
        requiredRemaining · minutesRemaining · lateStart · exceptionState
```

That answers: who has not started, who is active, who is behind, who is
critical, who can close, who missed, how much work remains. Pipeline/actions
today continue to come from the existing ledger (`action_events`,
`getDailySummary`), which I3 does not duplicate.

---

## 5. Multitenancy and security

| Table | Scope | RLS |
|---|---|---|
| `organization_operating_policy` | `organization_id` PK | members read; admins insert/update |
| `organization_day` | `organization_id` + date | members read; system writes |
| `rep_day` | `organization_id` + rep + date | rep reads/inserts/updates own; admin reads org; manager reads managed teams |
| `operational_jobs` | `organization_id` + dedupe key | no authenticated access; service role only |

Client-supplied organization or rep ids are never trusted. The exception review
path verifies the rep belongs to the caller's organization. `loadTeamDay`
requires admin or manager and always filters by `ctx.orgId`.

---

## 6. Performance

One Today load:

```text
auth + policy (cached 60s)
        ↓
parallel: today dashboard · relay queue · rep_day row
        ↓
derive state, commitments, pace  (pure, no I/O)
```

The workspace (identities, targets, accountability, replies) is a single
request-cached load shared by the page and the loader. The only added read is
the rep's own `rep_day` row. The policy is cached per process for 60 seconds.

The scheduler is bounded: ≤200 organizations per run, ≤200 jobs per run, and
stage-level jobs rather than per-rep jobs.

---

## 7. Migrations

| File | Contents |
|---|---|
| `20261030120000_organization_operating_clock.sql` | policy table + RLS + seed; `is_org_working_day` reads the policy; `record_activity_event` accepts `p_date` |
| `20261030120100_rep_day.sql` | `organization_day`, `rep_day`, constraints, indexes, RLS |
| `20261030120200_operational_scheduler.sql` | `operational_jobs` outbox, indexes, RLS (deny all) |

Each file ends with its own verification queries.

**Verified against a real Postgres** (scratch database on the local Supabase
engine, prerequisite schema applied, then the three migrations):

```text
ALL CHECKS PASSED   — 13 assertions
```

Including: the seeded policy is exactly Asia/Karachi 09:00–18:00 Mon–Fri;
`is_org_working_day` is false on Saturday and true on Monday;
`record_activity_event` writes the caller's date and is exactly-once; a
Saturday event records nothing; duplicate `rep_day`, `organization_day` and
`operational_jobs` rows are rejected; an invalid state, progress > 1 and a
reversed workday window are rejected; RLS is enabled on all four tables; the
scheduler has zero policies; `rep_day` has its three policies.

**Production status: NOT APPLIED.** There is no DDL path from this environment:
no `SUPABASE_DB_PASSWORD`, an empty keychain token, `supabase migration list
--linked` returns 403, and no SQL-execution RPC exists. The application degrades
safely without the migration (proven in the browser, §9).

---

## 8. Files removed / changed

Removed as obsolete, only where I1–I3 touched them:

- `isWorkingDay()` local helper in `src/lib/auth/workspace.ts` — replaced by `isOrgWorkingDay()`
- `computeDayElapsed()` and `computeTimeRemaining()` bodies in `dashboard-loader.ts` — the hardcoded 9–17 implementations replaced by the policy
- `dayProgress`/`workingMinutesRemaining` internals in `accountability-engine.ts` — now delegate to the clock (signatures preserved for existing callers)

No unrelated dead code was deleted. The simplification plan's removals are
still pending and should ride along with the increment that touches each area.

---

## 9. Tests

Full suite: **283 files / 4,161 tests / 0 failed** (exit 0), including the
three outage-recovery tests added last.

New suites, by the names the brief asked for:

| Suite | File |
|---|---|
| ORG_OPERATING_CLOCK | `tests/qa-org-clock.test.ts` |
| ORG_LOCAL_DATE_BOUNDARY | `tests/qa-org-local-date-boundary.test.ts` |
| DST_BOUNDARY | `tests/qa-dst-boundary.test.ts` |
| ORG_CLOCK_ARCHITECTURE_GUARD | `tests/qa-org-clock-architecture-guard.test.ts` |
| REP_DAY_STATE_MACHINE | `tests/qa-rep-day-state-machine.test.ts` |
| REP_DAY_PACING | `tests/qa-rep-day-pacing.test.ts` |
| REP_DAY_CHECKIN | `tests/qa-rep-day-checkin.test.ts` |
| REP_DAY_CLOSE | `tests/qa-rep-day-close.test.ts` |
| REP_DAY_EXCEPTION | `tests/qa-rep-day-exception.test.ts` |
| TODAY_SINGLE_SOURCE | `tests/qa-today-single-source.test.ts` |
| TODAY_NEXT_ACTION_ORDER | `tests/qa-today-next-action-order.test.ts` |
| SCHEDULER_IDEMPOTENCY | `tests/qa-scheduler-idempotency.test.ts` |
| WARNING_ESCALATION | `tests/qa-warning-escalation.test.ts` |
| MISSED_DAY_CLOSE | `tests/qa-missed-day-close.test.ts` |
| NEXT_DAY_CARRYOVER | `tests/qa-next-day-carryover.test.ts` |
| MULTITENANT_REP_DAY | `tests/qa-multitenant-rep-day.test.ts` |

No existing test was weakened. Two existing tests pinned the legacy 9–17
`DEFAULT_WORKING_DAY`; the default was kept at 17 (it is only the fallback for
callers that pass no policy) and the live paths were moved to the policy, so
both tests still pass unchanged.

## 10. Browser and mobile

Run against a local server on the **real production database**, which does not
yet have the migrations — so this also proves the degraded path:

```text
✓ Today renders the day header, commitments and a non-scrolling 375px layout
✓ the canonical day API returns the same contract (7 commitments, state enum)
- synthetic operating day  (skipped: needs a migrated database + RELAY_TEST_CLOCK=1)
```

What the passing test proves on real data:

- greeting, time remaining, commitment %, state pill and the seven commitments render
- `scrollWidth − clientWidth ≤ 1` at **375px**
- `/api/rep/day` returns `businessDate`, `timezone`, `state`, `minutesRemaining`,
  `commitmentProgress` and exactly seven commitments
- without the migration the panel shows "Your day is not being saved yet" and the
  page still works; nothing throws

The full synthetic day (08:50 → 09:05 → 12:00 → 15:00 → 16:30 → 17:30 → 17:45)
is committed in `e2e/foundation-i1-i3.spec.ts` and gated behind
`E2E_LOCAL_FOUNDATION=1`. It is **not executed** here, because no environment
combines a migrated database with the test clock. The same seven-state timeline
is proven deterministically in `qa-rep-day-state-machine.test.ts`, including
the exact times and the resulting state.

### Test clock

`src/lib/org-clock/clock.ts` + `POST /api/qa/clock`. The override is inert
unless `RELAY_TEST_CLOCK=1` **and** `NODE_ENV !== 'production'`. It is never
enabled by a header or cookie, so a production deployment cannot be
time-travelled by a caller.

---

## 11. Gate results

```text
TYPECHECK                PASS   (tsc --noEmit, 0 errors)
LINT                      PASS   (0 errors; warnings at baseline)
BUILD                     PASS   (next build, exit 0)
FULL TESTS                PASS   283 files / 4,161 tests / 0 failed
ORG_CLOCK_GATE            PASS   39 tests + 4 architecture guard
TIMEZONE_GATE             PASS   Karachi / New York / London / UTC, DST both directions
REP_DAY_GATE              PASS   48 state/pacing/check-in/close/exception tests
DAILY_OPERATIONS_GATE     PASS   synthetic day proven on the pure machine
SCHEDULER_GATE            PASS   13 idempotency + recovery tests
MULTITENANT_GATE          PASS   6 schema + contract tests
MIGRATIONS                PASS   13 assertions on a real Postgres
MOBILE_375_GATE           PASS   no horizontal overflow, real data
BROWSER_GATE              PARTIAL 2 passed; full synthetic day needs a migrated env
PRODUCTION_MIGRATION      BLOCKED no DDL path; app degrades safely
```

---

## 12. Known risks

1. **The migrations are not applied to production.** Check-in and close are
   unavailable there until they are; Today still renders live numbers and says
   so. Apply `supabase db push --linked` (or the three SQL files in the Supabase
   editor), then confirm the policy row and one rep-day row.
2. **Cron cadence vs plan.** `*/10 * * * *` requires a Vercel plan that allows
   sub-daily crons. If the deploy is rejected, the previous build stays live and
   the schedule must be relaxed or triggered externally.
3. **`Qualified` is not measured yet.** No event emits `proposal`, so the row is
   shown but excluded from the pace denominator. It becomes real when the
   opportunity engine (I6) emits it — a configuration change, not a code change.
4. **Scheduler only refreshes stored rep days.** If neither Today nor the worker
   runs, an admin sees the last snapshot. The worker runs every 10 minutes, so
   the window is small.
5. **Per-rep targets are still per identity.** `rep_day` aggregates them, but a
   rep with no configured targets falls back to the policy pack. Admin target
   configuration remains the source of truth.
6. **The synthetic-day browser test has never been executed.** It is committed
   and gated; it must run once a migrated environment exists before I4 is called
   done.

---

## 13. Status

```text
I1 STATUS   COMPLETE — code, migration, tests, DB verification
I2 STATUS   COMPLETE — model, state machine, pacing, check-in/out, Today
I3 STATUS   COMPLETE — outbox, worker, warnings, escalation, missed close, carryover

READY FOR I4: NO
```

**Why not yet.** I4 is the command centre, and it reads `rep_day`. The code and
the contract are ready, but three things must happen first:

1. apply the three migrations to production and confirm the policy row,
2. run `e2e/foundation-i1-i3.spec.ts` with `E2E_LOCAL_FOUNDATION=1` against a
   migrated environment, so the synthetic day is proven in a browser and not
   only on the pure machine,
3. confirm the 10-minute cron is accepted by the deployment plan.

Once those three pass, I4 can start against `loadTeamDay()` without rework.

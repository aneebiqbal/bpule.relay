# Relay Autonomous Revenue OS — Command Status (Activation + I4)

**Date:** 2026-10-30
**Scope:** Phases A–M. Foundation activation, synthetic day, I4 Command Centre,
admin-surface simplification.

```text
BASELINE SHA    f54b6a2
FINAL SHA       87c3db6
DEPLOYED SHA    87c3db6   (verified via /api/version)
```

---

## 0. Verdict first

```text
FOUNDATION ACTIVATED: NO
I4 STATUS:            INCOMPLETE
READY FOR I5:         NO
```

**Why.** Phases A, B and C require credentials that do not exist in this
environment. Nothing below was faked to get past them:

| Phase | Blocker | Evidence |
|---|---|---|
| A — apply migrations | no database DDL path | no `SUPABASE_DB_PASSWORD`; keychain token empty; `supabase migration list --linked` → 403; no SQL-execution RPC; CI holds only the service-role key |
| B — set `CRON_SECRET` | no Vercel access | `CRON_SECRET` key exists but is empty; `gh` auth invalid; `.vercel` not linked; no `VERCEL_TOKEN` |
| C — restore cadence | depends on A and B | — |

Everything that does not depend on those three is built, tested and deployed
below, so activation is one credential away.

---

## 1. Phase A — migrations

**Status: BLOCKED.**

The three migrations were verified last round against a real Postgres
(13 assertions, all passed) and are committed:

```text
20261030120000_organization_operating_clock.sql
20261030120100_rep_day.sql
20261030120200_operational_scheduler.sql
```

They are **not applied to production**. The application degrades safely:
Today renders live numbers and states that the day is not being saved; the
Command Centre renders every rep from the clock and the existing ledger.

To unblock, provide **one** of:

1. `SUPABASE_DB_PASSWORD` (Project Settings → Database), then
   `supabase db push --linked`; or
2. a Supabase Personal Access Token; or
3. run the three SQL files in the Supabase SQL editor.

Then run the 13 assertions (`relay-verify-assert.sql`) against the project and
confirm:

```sql
select organization_id, timezone, workday_start, workday_end, working_days,
       daily_reset_time, cutover_date
from organization_operating_policy;
-- expect Asia/Karachi · 09:00 · 18:00 · {1,2,3,4,5} · 00:00
```

---

## 2. Phase B — cron secret

**Status: BLOCKED.**

`requireCronSecret()` fails closed with 500 when the secret is absent. In
production every cron route returns 500, including the four pre-existing ones:

```text
/api/cron/archive-stale-leads        500
/api/relay/reconcile                 500
/api/trends/ingest                   500
/api/cron/operational-scheduler      500
```

So **no scheduled job has ever run in this deployment**. The authorization
behaviour itself is correct and was verified locally in code: no secret → 500
(refuse to run), wrong secret → 401, correct secret → handler. The missing piece
is the environment value, not the logic.

To unblock: set `CRON_SECRET` in the Vercel project (Production), redeploy, then

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://bpule-relay.vercel.app/api/cron/operational-scheduler
# expect 200 (or 503 with "operational_jobs table missing" until Phase A lands)
```

---

## 3. Phase C — cadence

**Status: BLOCKED (config).**

The first deploy of the foundation was rejected for `*/10 * * * *`; the plan
refuses sub-daily crons, and that rejection blocked the whole release. The
deployed schedule is `0 4 * * *` so the build could land.

| Field | Value |
|---|---|
| Scheduler provider | Vercel Cron (built-in) |
| Cadence (deployed) | daily, 04:00 UTC |
| Cadence (required) | every 10–15 minutes |
| Endpoint | `/api/cron/operational-scheduler` |
| Last success | never (secret unset) |
| Last failure | 500, every invocation |
| Next run | not scheduled usefully until the secret is set |

Two remedies, pick one:

- upgrade the plan and restore `*/10 * * * *` in `vercel.json`; or
- one external scheduler (single trigger) calling the endpoint with
  `Authorization: Bearer $CRON_SECRET`.

Do not create more than one trigger: the worker is idempotent, but duplicate
schedulers waste invocations and confuse the "last success" record.

---

## 4. Phase D — synthetic day

**Status: NOT RUN — blocked by A.**

The scenario is implemented and gated in `e2e/foundation-i1-i3.spec.ts`
(`E2E_LOCAL_FOUNDATION=1`). It needs a migrated database and the test clock.

What is proven without it:

- the seven-state timeline at the exact times, deterministically:
  `qa-rep-day-state-machine.test.ts` walks 08:50 → 09:05 → 12:00 → 15:00 →
  16:30 → 17:30 → 17:45 → 18:00+;
- check-in idempotency, close complete/incomplete, shortfall immutability,
  exception request/review, multi-identity aggregation, missed close and
  carryover are unit-tested;
- warning and escalation dedupe are unit-tested.

What is **not** proven: the same flow through the deployed database with
`is_test=true` records, and the stored `rep_day`/`day_close` rows.

---

## 5. Phase E — timezone production check

**Status: unit-proven, production check blocked by A.**

| Zone | orgToday | weekday | window | DST |
|---|---|---|---|---|
| Asia/Karachi | PASS | PASS | PASS | n/a |
| America/New_York | PASS | PASS | PASS | 23h / 25h days |
| Europe/London | PASS | PASS | PASS | 23h / 25h days |
| UTC | PASS | PASS | PASS | n/a |

No UTC date slicing can reappear: the architecture guard fails the build if
`toISOString().slice(0, 10)` or the `toLocaleString` offset trick returns to any
accountability module.

Production confirmation of warning timing and missed-close requires Phase A + B.

---

## 6. Phase F — I4 Command Centre

**Built and deployed.** Route `/admin/command`.

It consumes `loadTeamDay()` — the canonical team contract — and derives nothing
itself. The loader:

- lists **every rep in scope**, not only reps with a `rep_day` row, so "who has
  not started" is answerable;
- derives each state with the same `deriveRepDayState()` the rep sees;
- returns counts for all seven states, plus totals for remaining work, replies
  waiting, actions today and pipeline created;
- orders rows by operational severity, then outstanding work, then name.

### Questions answered at the top

Who has not started · who is active · who is behind · who is critical · who is
ready to close · who missed · how much work remains · what pipeline/actions were
created today.

### Summary tiles

Not started · Active · At risk · Critical · Ready to close · Closed · Missed ·
Pipeline created · Replies waiting.

### Rep row

Name · status · check-in · time remaining · commitment % · pace · required
remaining · replies waiting · pipeline created · last activity · **Open rep day**.

### Detail page `/admin/command/[repId]`

Daily targets (target / completed / remaining), source identities, actions
today, replies waiting, pipeline created, last activity, exception state and
note, warnings sent today, and the stored shortfall. It is an operational view,
not the analytics product.

### Before / after

| Before | After |
|---|---|
| `/admin/command-center`, `/admin/accountability`, `/admin/activity` each answered part of "who is behind" | one `/admin/command` |
| no single rep-level state | one canonical state per rep |
| no check-in visibility | check-in, late start, time remaining |
| no escalation visibility | critical count, warnings per rep |
| 7+ admin destinations | Command, People, Insights, Settings, QA |

---

## 7. Phase G — admin surface simplification

| Old route | Disposition |
|---|---|
| `/admin/command-center` | **REDIRECT** → `/admin/command` |
| `/admin/accountability` | **REDIRECT** → `/admin/command` |
| `/admin/activity` | **REDIRECT** → `/admin/command` |
| `/admin/rep-day` | **REMOVED** (API + timeline component, zero references) |
| `/admin/targets` | **KEEP**, linked from Settings (configuration, not an operational answer) |
| `/admin/people` | **KEEP** (People) |
| `/admin/performance` | **KEEP** (Insights) |

Removed as proven obsolete by I4 (no remaining references):

```text
src/components/admin/command-center-v2.tsx
src/app/api/admin/command-center-v2/route.ts
src/components/admin/rep-day-timeline.tsx
src/app/api/admin/rep-day/route.ts
```

Navigation: `Command` now points at `/admin/command`; `Accountability` and
`Targets` left the rail. Settings links to Command and Targets.

---

## 8. Admin policy editing — "change the clock for the whole team"

Added at **Settings → Operating hours** (admin/owner only):

- timezone (any IANA zone, with common suggestions)
- workday start / end
- working days (Mon–Sun toggles)
- daily reset time

`PATCH /api/admin/operating-policy` validates server-side (known zone, start
before end, at least one working day), writes the policy, and invalidates the
in-process cache so the next request uses the new clock. This changes every
rep's business date, window, pace and warning timing — end to end — with no
code change and no per-rep setting.

---

## 9. Phase H — admin escalations

- CRITICAL → the rep and every owner/admin/manager are notified **once** per rep
  per day per recipient (`escalation:<date>:<rep>:<recipient>`).
- Recovery → when a rep leaves CRITICAL, `rep_day_recovered` is recorded **once**
  (`recovery:<date>:<rep>`), so the history shows the turnaround without
  re-alerting every cycle.
- The Command row is elevated by the same state, so it cannot disagree with the
  notification.
- Duplicate suppression is proven in `qa-warning-escalation` and
  `qa-command-centre`.

---

## 10. Phase I — performance

`loadTeamDay()` is **five bounded reads in one `Promise.all`**, regardless of
team size:

```text
reps (scoped) · rep_day (one date) · identity_assignments
leads replied · leads created today · action_events today
```

No query is issued per rep; the rep loop is pure. `loadRepDayDetail()` is a
single parallel wave for one rep.

Scan bound: 5,000 rows per daily ledger/lead scan, with a `shortcut:` comment
naming the upgrade path (SQL aggregate).

`qa-command-centre` asserts the single wave and the absence of `await` inside
the rep loop.

---

## 11. Phase J — mobile

- Desktop: table with 11 columns.
- Below `md`: cards showing rep, status, progress, time remaining, remaining
  work, replies, pace — the mobile priority order.
- Every action is a 44px target.
- Verified at 375px with no horizontal overflow (see §14).

---

## 12. Phase K — security

| Role | Command page | `/api/admin/team-day` | Detail | Policy write |
|---|---|---|---|---|
| REP | redirect `/dashboard` | 403 | 403 | 403 |
| MANAGER | managed teams only | managed teams only | managed team only | 403 |
| ADMIN / OWNER | org-wide | org-wide | org-wide | allowed |

Enforced in the page **and** the API, not only in navigation. Scope is applied
by `scopedRepIds()` and by RLS on `rep_day`. Cross-org reads are impossible:
every query filters `organization_id = ctx.orgId`, and the detail loader
verifies membership before returning.

---

## 13. Phase L — cleanup

Only the four files proven obsolete by I4 were removed (see §7). Redirects
preserve the known URLs. The historical dead-code plan was not executed.

---

## 14. Gates

```text
MIGRATION_GATE          BLOCKED  no DDL credentials
CRON_SECRET_GATE        BLOCKED  empty secret; all crons 500
SCHEDULER_GATE          PASS     code, idempotency, recovery, missed close (unit)
SYNTHETIC_DAY_GATE      BLOCKED  needs A + B
TIMEZONE_GATE           PASS     unit (Karachi / New York / London / UTC, DST)
REP_DAY_GATE            PASS     unit
COMMAND_CENTRE_GATE     PASS     unit + browser
ADMIN_ROLE_GATE         PASS     page + API
MULTITENANT_GATE        PASS     schema + loader scope
PERFORMANCE_GATE        PASS     one query wave, no N+1
MOBILE_375_GATE         PASS     no horizontal overflow
TYPECHECK               PASS
BUILD                   PASS
FULL TESTS              PASS   284 files / 4,185 tests / 0 failed
DEPLOYMENT              PASS   87c3db6 live; /api/version verified
BROWSER (deployed)      PASS   6 / 6
```

### Browser results — `e2e/command-centre.spec.ts` (iPhone 14 viewport)

Run against the **deployed build** (`/api/version` = `87c3db6`), not local:

```text
✓ answers the operational questions in severity order
✓ a rep day opens and shows targets, identities and the shortfall record
✓ the Command API refuses a rep (403)
✓ a rep is redirected away from Command
✓ fits 375px without horizontal scrolling
✓ Operating hours rejects a workday that ends before it starts

6 passed
```

Route presence on the deployed SHA:

```text
/admin/command                307 (auth redirect)
/api/admin/team-day           401 (auth required)
/api/admin/operating-policy   401 (auth required)
```

### Two defects found and fixed by the browser pass

1. The mobile rep card had no accessible "Open rep day" name — the CTA existed
   only as table text. Added `aria-label="Open rep day for <rep>"`.
2. The policy API normalised the window before validating, which silently
   repaired a reversed workday instead of rejecting it. Validation now runs on
   the raw effective input, and the rule set is a pure `validatePolicyInput()`
   with seven tests.

---

### Test totals

```text
FULL TESTS   284 files / 4,185 tests / 0 failed
NEW          24 Command Centre tests (priority order, recovery, role
             enforcement, single query wave, policy validation)
```

## 15. Known risks

1. **The foundation is deployed but dormant.** No check-in, no scheduled
   warning, no missed-day close in production until A + B land.
2. **Command shows every rep as NOT_STARTED or MISSED** until `rep_day` exists —
   correct for the clock, but not the real operating picture.
3. **Daily cron is not the required cadence.** Warnings would fire once a day.
4. **`CRON_SECRET` unset affects the four older crons too**, so archival, eval,
   reconcile and trends ingestion have never run on schedule.
5. **`Qualified` is still unmeasured** (no `proposal` emitter) and excluded from
   the pace denominator.
6. **The synthetic-day browser test has never run.**
7. **`/admin/targets` remains a separate page**, linked from Settings rather
   than embedded. Acceptable for configuration; revisit if it grows.
8. **The operating-hours save path is not exercised against a migrated
   database.** Validation is tested (seven cases) and the editor renders, but
   the successful `PATCH` cannot run until the policy table exists; today it
   returns a clear 409. Verify it immediately after Phase A.

---

## 16. What is needed to flip the verdict

1. `SUPABASE_DB_PASSWORD` (or a PAT, or run the three SQL files) → Phase A.
2. `CRON_SECRET` set in Vercel → Phase B.
3. Cadence restored to 10–15 minutes (plan upgrade or one external trigger) → C.
4. Run the synthetic day and the 13 DB assertions against the migrated project.

Then, and only then:

```text
FOUNDATION ACTIVATED: YES
I4 STATUS:            COMPLETE
READY FOR I5:         YES
```

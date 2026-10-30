# Relay Autonomous Revenue OS — Sources Sprint Status

**Date:** 2026-10-30
**Status:** HALTED AT PHASE B — foundation activation gate blocked by credentials.
**I5 not started.** The sprint's own rule forbids it until the foundation gate passes.

---

## Phase A — freeze and release identity

| Field | Value |
| --- | --- |
| Branch | `release-merge` |
| HEAD | `c78b5ac` |
| `origin/main` | `c78b5ac` (in sync) |
| Working tree | clean |
| Worktrees | 3 — `scout` (`c78b5ac`), `scout-rc` (`2581561`, detached), `.claude/worktrees/simplify` (`d8ba3ea`) |
| Active writers | 0 |
| Deployed SHA | **unknown** — Vercel CLI returns `forbidden` for this account |

### Baseline gates

| Gate | Result |
| --- | --- |
| `pnpm qa:contracts` | **PASS** — 41/41 |
| `pnpm qa:release` | **AUTOMATED_CODE_GATE PASS** — 4185 tests / 0 failed / 0 skipped |
| `npx tsc --noEmit` | **PASS** |
| `npx eslint .` | **PASS** — 0 errors, 806 pre-existing warnings |
| `pnpm build` | **PASS** — exit 0 |

`qa:release` also reports, correctly: `BROWSER_GATE NOT_RUN`, `BUG004_INBOUND_GATE
NOT_RUN`, `AUTH_ONBOARDING_GATE NOT_RUN`, `SHA_GATE NOT_VERIFIED`,
`PRODUCTION_GATE BLOCKED`.

---

## Phase B — migrations: BLOCKED

The connected database is **production**: 730 leads, 1112 messages, 14 profiles.
It matches the environment the operator has been reading numbers from.

All four operating tables are absent:

```
organization_operating_policy   404 MISSING
organization_day                404 MISSING
rep_day                         404 MISSING
operational_jobs                404 MISSING
```

The three migrations exist and are **purely additive** — no `DROP`, `ALTER`,
`DELETE` or `TRUNCATE` against existing data:

```
20261030120000_organization_operating_clock.sql   288 lines
20261030120100_rep_day.sql                        158 lines
20261030120200_operational_scheduler.sql           96 lines
```

**No DDL credential is available**, so they cannot be applied:

| Credential | State |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | missing |
| `SUPABASE_DB_PASSWORD` | missing |
| `DATABASE_URL` / `DIRECT_URL` / `POSTGRES_URL` | missing |
| Service-role key | present — but PostgREST cannot execute DDL |
| Supabase CLI | authenticated, project linked (`fhnkanwvgamitrcuzpem`) — `migration list` returns **403: account lacks privileges** |

`MIGRATION_GATE: BLOCKED`.

---

## Phase C — cron: audited, BLOCKED

All six scheduled routes are guarded by `requireCronSecret()`, and the guard
**fails closed**:

```ts
if (!secret) return { ok: false, status: 500 }   // refuse, never silently allow
if (auth !== `Bearer ${secret}`) return { ok: false, status: 401 }
```

Guarded routes: `cron/operational-scheduler`, `cron/archive-stale-leads`,
`relay/reconcile`, `few-shot/refresh`, `eval/cron-run`, `trends/ingest`.

`CRON_SECRET` is **empty locally and unset in production**. Because the guard
fails closed, every scheduled invocation currently returns **500**. That is the
precise mechanism behind "scheduled operations had effectively never been
running" — not silence, but a fail-closed refusal on every run.

`CRON_SECRET_GATE: BLOCKED`.

---

## Phase D — cadence: BLOCKED

`vercel.json` schedules the operational scheduler at `0 4 * * *` — **daily at
04:00**, not the required 10–15 minutes. The scheduler route's own header says
it expects ten-minute cadence. Changing the schedule requires a deploy, and the
account cannot deploy.

`CADENCE_GATE: BLOCKED`.

---

## Gate matrix

| Gate | Status | Reason |
| --- | --- | --- |
| MIGRATION_GATE | **BLOCKED** | 4 tables missing; no DDL credential |
| CRON_SECRET_GATE | **BLOCKED** | secret unset; guard fails closed → all crons 500 |
| SCHEDULER_GATE | **BLOCKED** | depends on tables |
| CADENCE_GATE | **BLOCKED** | daily 04:00, not 10–15 min; needs deploy |
| SYNTHETIC_DAY_GATE | **BLOCKED** | needs a migrated deployed environment |
| OPERATING_POLICY_GATE | **BLOCKED** | depends on tables |
| REP_DAY_PARITY_GATE | **BLOCKED** | depends on tables |
| TIMEZONE_GATE | **BLOCKED** | depends on tables |
| MULTITENANT_GATE | **BLOCKED** | depends on tables |
| SECURITY_GATE | PASS (cron auth audited) | — |
| TYPECHECK / LINT / BUILD / FULL_TESTS | **PASS** | 4185 / 0 / 0 |
| BROWSER_GATE | NOT RUN | no deployed preview |
| SHA_GATE | NOT VERIFIED | no `/api/version` reachable |
| PRODUCTION_SMOKE | NOT RUN | — |

---

## What was deliberately not done

**I5 Sources was not started.** The sprint defines a foundation activation gate
that must pass before I5 begins, and five of its nine gates are blocked. Building
a Sources UI on a dormant operating foundation is exactly what the sequence
(`ACTIVATE → PROVE → STABILIZE → BUILD I5`) forbids.

No production mutation was performed. No migration was applied, no secret was
set, no schema was altered.

---

## To unblock

Three independent actions, all requiring credentials this environment does not
have:

1. **Apply the three migrations** — provide `SUPABASE_DB_PASSWORD` (or
   `SUPABASE_ACCESS_TOKEN`, or an account with migration privileges on
   `fhnkanwvgamitrcuzpem`). Then apply in order and run the 13 database
   assertions.
2. **Set production `CRON_SECRET`** — and verify no-secret → 500,
   wrong-secret → 401, correct-secret → 200.
3. **Restore Vercel access** for the account, or deploy from an authorized one —
   needed for the cadence change, `/api/version`, and the browser gates.

---

## Final status

```
FOUNDATION ACTIVATED:      NO
I4 STATUS:                 INCOMPLETE — built and deployed, activation unproven
I5 STATUS:                 NOT STARTED
READY FOR I6 JOB RADAR:    NO
FINAL VERDICT:             NO-GO
```

The blocker is credential access, not code. Phase A is green and recorded here so
the activation work can resume from an exact baseline.

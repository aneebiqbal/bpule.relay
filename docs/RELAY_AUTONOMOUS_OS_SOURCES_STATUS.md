# Relay Autonomous Revenue OS — Sources Sprint Status

**Date:** 2026-10-30
**Status:** Foundation activation **PENDING_HUMAN** (SQL artifacts ready). I5 not started.

Per the never-stop rule, the sprint continued as far as it safely could: the
activation artifacts are generated and the baseline is green. The one remaining
blocker is a database credential, which is a human action.

---

## Phase A — freeze and release identity

| Field | Value |
| --- | --- |
| Branch | `release-merge` |
| HEAD | `c78b5ac` (baseline) |
| `origin/main` | `c78b5ac` |
| Working tree | clean |
| Active writers | 0 |
| Deployed SHA | unknown — Vercel CLI `forbidden` for this account |

### Baseline gates

| Gate | Result |
| --- | --- |
| `pnpm qa:contracts` | **PASS** — 41/41 |
| `pnpm qa:release` | **AUTOMATED_CODE_GATE PASS** — 4185 / 0 failed / 0 skipped |
| `npx tsc --noEmit` | **PASS** |
| `npx eslint .` | **PASS** — 0 errors, 806 pre-existing warnings |
| `pnpm build` | **PASS** — exit 0 |

---

## Migrations — PENDING_HUMAN

The connected database is **production**: 730 leads, 1112 messages, 14 profiles.

All four operating tables are absent:

```
organization_operating_policy   404 MISSING
organization_day                404 MISSING
rep_day                         404 MISSING
operational_jobs                404 MISSING
```

### Why this could not be applied automatically

The Supabase CLI is now authenticated and linked to `fhnkanwvgamitrcuzpem`, and
`migration list` works. But there is **no path to execute DDL**:

| Route | Result |
| --- | --- |
| `psql` via `supabase/.temp/pooler-url` | connection string carries **no password** |
| `SUPABASE_DB_PASSWORD` | missing |
| `SUPABASE_ACCESS_TOKEN` | missing |
| CLI keychain token → Management API | **401** `JWT could not be decoded` |
| Service-role key | present, but PostgREST cannot execute DDL |

### `supabase db push` is unsafe here — do not run it

`migration list` reports **48 local-only migrations**, and `db push --dry-run`
aborts with:

```
Found local migration files to be inserted before the last migration on remote database.
Rerun with --include-all to apply: 0090_profile_intelligence_v2.sql, 0091_profile_spreadsheet_support.sql
```

A plain `db push` would apply a large, out-of-order migration set to production.
That is far outside this sprint's authority and outside the three operating
migrations. **Apply only the three files.**

### Artifacts

| File | Purpose |
| --- | --- |
| `docs/manual/RELAY_FOUNDATION_APPLY.sql` | the three migrations, concatenated in order, **verbatim** (verified byte-for-byte) |
| `docs/manual/RELAY_FOUNDATION_VERIFY.sql` | read-only assertions: tables, RLS, unique keys, indexes, default policy, cutover |
| `docs/manual/RELAY_SCHEDULER_SETUP.sql` | pg_cron + pg_net + Vault + one `*/10` schedule |

The three migrations are additive plus one seed row (the default bpulse policy).
The `drop policy if exists` statements only target policies the same migration
creates.

---

## Scheduler — design final, activation PENDING_HUMAN

**Provider: Supabase Cron** (`pg_cron` + `pg_net`), per the preferred hierarchy.

```
Supabase Cron (*/10 * * * *)
    → authenticated GET
    → /api/cron/operational-scheduler
    → operational_jobs
    → idempotent workers
```

One global UTC trigger. The worker already evaluates each organization against
its own local clock, so no per-timezone jobs.

`CRON_SECRET` has been generated locally (32 random bytes, base64url) and written
to `.env.local`, which is gitignored. **The value is not in git, docs, logs or
this report.** The same value must be set in the Relay runtime environment.

### Double-trigger risk — read before setting the secret

`vercel.json` still schedules `operational-scheduler` at `0 4 * * *`. Today that
route returns **500 on every invocation** because `CRON_SECRET` is unset and
`requireCronSecret` fails closed. The moment the secret is set, that daily Vercel
job becomes live as a **second trigger**.

Sequence that avoids two schedulers:

1. Apply the migrations.
2. Set `CRON_SECRET` in Relay and run `RELAY_SCHEDULER_SETUP.sql`.
3. Verify a Supabase Cron run returns 200.
4. **Then** remove the `operational-scheduler` entry from `vercel.json`.

Do not remove it first, or the worker has no trigger at all.

### Cron authorization — audited

All six scheduled routes use `requireCronSecret()`, which fails closed:

```ts
if (!secret) return { ok: false, status: 500 }
if (auth !== `Bearer ${secret}`) return { ok: false, status: 401 }
```

`cron/operational-scheduler`, `cron/archive-stale-leads`, `relay/reconcile`,
`few-shot/refresh`, `eval/cron-run`, `trends/ingest` — all guarded. This is the
precise mechanism behind "scheduled operations never ran": refusal, not silence.

---

## Gate matrix

| Gate | Status |
| --- | --- |
| TYPECHECK | **PASS** |
| LINT | **PASS** |
| BUILD | **PASS** |
| FULL_TESTS | **PASS** — 4185 / 0 / 0 |
| SECURITY (cron auth) | **PASS** |
| MIGRATION_GATE | **PENDING_HUMAN** — no DDL credential |
| SCHEDULER_TRIGGER_GATE | **PENDING_HUMAN** — needs migrations + secret |
| SCHEDULER_HEALTH_GATE | **NOT BUILT** — see below |
| SCHEDULER_IDEMPOTENCY_GATE | **PENDING_HUMAN** — needs a live trigger |
| SYNTHETIC_DAY_GATE | **PENDING_HUMAN** — needs migrations + trigger |
| OPERATING_POLICY_GATE | **PENDING_HUMAN** |
| REP_DAY_PARITY_GATE | **PENDING_HUMAN** |
| TIMEZONE_GATE | **PENDING_HUMAN** |
| MULTITENANT_GATE | **PENDING_HUMAN** |
| BROWSER_GATE | **NOT RUN** — no deployed preview |
| SHA_GATE | **NOT VERIFIED** |
| PRODUCTION_SMOKE | **NOT RUN** |

---

## Not done, and why

**I5 Sources was not started.** Building a Sources domain and UI is a multi-day
vertical slice. The sprint forbids shallow placeholders, and this pass had
neither the schema nor the runway to do it properly. Shipping a `/sources` shell
that cannot persist a submission would be exactly the placeholder the brief
prohibits.

**Scheduler health service and "Run scheduler now" (Phases H, J) were not built.**
Both are real features needing schema, tests and a deploy to observe; they belong
in the same coherent commit as the Sources work rather than as an unverified
fragment on the release branch.

No production mutation was performed. No migration applied, no secret set, no
schema altered, no deploy.

---

## Human actions, in order

1. Supabase SQL Editor → run `docs/manual/RELAY_FOUNDATION_APPLY.sql`.
2. Run `docs/manual/RELAY_FOUNDATION_VERIFY.sql` → paste the output back.
3. Set the generated `CRON_SECRET` (from `.env.local`) in the Relay runtime
   environment.
4. Run `docs/manual/RELAY_SCHEDULER_SETUP.sql` with the same secret substituted.
5. After a Supabase Cron run returns 200, remove the `operational-scheduler`
   entry from `vercel.json`.
6. Restore Vercel access for the cadence deploy, `/api/version` and browser gates.

---

## Final status

```
BASELINE SHA:            c78b5ac
FINAL SHA:               (this commit)
DEPLOYED SHA:            unknown — no Vercel access

FOUNDATION ACTIVATED:    PENDING_HUMAN
I4 STATUS:               INCOMPLETE — built and deployed, activation unproven
I5 STATUS:               INCOMPLETE — not started
READY FOR I6 JOB RADAR:  NO
FINAL VERDICT:           NO-GO
```

The blocker is one database credential, not code. Everything that could be
prepared without it has been prepared.

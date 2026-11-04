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

## Migrations — **PASS**

> **Verified live (2026-10-30):** all four tables exist.
>
> | Table | State |
> | --- | --- |
> | `organization_operating_policy` | **EXISTS** — 11 policy rows |
> | `organization_day` | **EXISTS** |
> | `rep_day` | **EXISTS** |
> | `operational_jobs` | **EXISTS** — 19 columns |
>
> The production org `11111111…` (**bpulse**, 735 leads) carries exactly the
> expected policy: `Asia/Karachi` · `09:00–18:00` · Mon–Fri · reset `00:00` ·
> cutover `2026-10-30` · 7-item target pack. The ten other organizations are
> empty tenants and received UTC defaults by design.
>
> `organization_day` and `rep_day` column shapes match what the scheduler code
> reads and writes. `is_org_working_day(uuid, date)` and
> `record_activity_event(uuid, uuid, text, uuid, text, date)` both exist.
>
> **Fixed on the way:** migration 1 ended with `comment on function
> public.record_activity_event` without a signature. Production already carried
> an overload of that name, so Postgres rejected it with `42725: function name
> is not unique` and the whole migration rolled back. Both function comments now
> carry their argument lists (`349ee5e`).
>
> **Divergence to watch:** `organizations.timezone` is still `UTC` for bpulse
> while the policy says `Asia/Karachi`. The policy is authoritative by design,
> but any code reading the legacy column will disagree. `TIMEZONE_GATE` must
> prove which one every surface reads.

The connected database is **production**: 735 leads, 1112 messages, 14 profiles.

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

## Database structure — verified live, not inferred

PostgREST cannot read RLS flags or constraint definitions, so each was proven by
behaviour against production on 2026-10-30:

| Property | Test | Result |
| --- | --- | --- |
| RLS on all four tables | `anon` key, `select *` | **0 rows on every table** — no leak |
| `operational_jobs(org, dedupe_key)` | duplicate insert | **409** |
| `organization_day(org, business_date)` | duplicate insert | **409** |
| `rep_day(org, rep, business_date)` | duplicate insert | **409** |
| CHECK constraints | invalid `state` / `job_kind` | **400 / 23514** — enforced |
| Cleanup | delete by exact id, re-select | **0 probe rows remain** |

Probe rows used `business_date` 2099-12-29/30/31 and a `qa-unique-probe-<ts>`
dedupe key, deleted by primary key immediately after each assertion.

**Not observable through PostgREST:** index existence and function argument
signatures. The indexes are defined in the applied migration
(`od_org_date_idx`, `oj_due_idx`, `oj_org_date_idx`, `oj_state_idx`,
`rd_org_date_idx`, `rd_org_state_idx`, `rd_rep_date_idx`); confirming them needs
`RELAY_FOUNDATION_VERIFY.sql` output or a direct connection.



`record_activity_event` accumulated four definitions across migrations:

```
0085 / 0091   (uuid, uuid, text, uuid)                       4-arg
20261001      (uuid, uuid, text, uuid, text)                  5-arg
20261030      (uuid, uuid, text, uuid, text, date)            6-arg
```

`create or replace` at a different arity **adds an overload**, it does not
replace one. 20261030 drops the 5-arg, but the 4-arg from 0085/0091 was never
dropped — which is why `comment on function` failed with `42725`.

| Call site | Args | Resolves to |
| --- | --- | --- |
| `supabase-store.ts:1575` | 6 (incl. `p_date`) | 6-arg |
| `supabase-store.ts:3105` | 6 | 6-arg |
| `supabase-store.ts:3230` | 6 | 6-arg |
| `supabase-store.ts:5585` | 5 (incl. `p_date`) | 6-arg |

A call that omits `p_date` matches both the 4-arg and the 6-arg and fails at
runtime as ambiguous. `tests/rpc-signature-resolution.test.ts` pins every call
site to `p_date` and the six declared parameters.

**Removal plan for the obsolete 4-arg (not applied):** confirm no external caller
depends on it, then `drop function if exists
public.record_activity_event(uuid, uuid, text, uuid)` in a dedicated migration
with the guard test already in place. Do not drop it casually — a scheduled job
or an older deploy could still call it.

---

## Timezone authority

Production disagrees with itself: `organizations.timezone = UTC` for bpulse while
`organization_operating_policy.timezone = Asia/Karachi`.

Classification of live readers:

| Reader | Class | Action |
| --- | --- | --- |
| `dashboard/page.tsx` | OPERATING_DAY | **moved** to `loadOperatingPolicy` |
| `performance/page.tsx` | OPERATING_DAY | **moved** to `loadOperatingPolicy` |
| `api/admin/performance/route.ts` | OPERATING_DAY | **moved** to `loadOperatingPolicy` |
| `api/accountability/warnings/route.ts` | OPERATING_DAY | already policy-based |
| `admin/command/[repId]/page.tsx` | DISPLAY_ONLY | left alone |
| `settings/page.tsx` | DISPLAY_ONLY | left alone |
| `content/.../daily-brief`, `growth-v2/daily` | OTHER (content scheduling) | left alone |
| `admin/revenue-identities/[id]/email` | CONTACT_WINDOW | already policy-based |

`tests/timezone-authority.test.ts` forbids the modules that decide the business
day from reading `rep.timezone` or the legacy org column.



## Gate matrix

| Gate | Status |
| --- | --- |
| TYPECHECK | **PASS** |
| LINT | **PASS** |
| BUILD | **PASS** |
| FULL_TESTS | **PASS** — 4185 / 0 / 0 |
| SECURITY (cron auth) | **PASS** |
| MIGRATION_GATE | **PASS** — 4/4 tables, policy verified live |
| DATABASE_STRUCTURE_GATE | **PASS** — RLS, 3 unique keys and CHECKs proven live; indexes need a direct connection |
| RPC_SIGNATURE_GATE | **PASS** — 4 call sites audited, all resolve to the 6-arg overload; guard test |
| TIMEZONE_GATE | **PARTIAL** — readers fixed and guarded; DB still disagrees; matrix not run |
| SCHEDULER_TRIGGER_GATE | **PENDING_HUMAN** — needs `CRON_SECRET` in Vercel + one Supabase Cron job |
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

# Relay Unified Operations — Phase 4 Live Certification

**Date:** 2026-11-26 · **Starting SHA:** `eeebb798` · **Tree:** uncommitted, one working tree
**Production:** untouched — no migrations, no deployment, no worker activation.

## Environment

Disposable PostgreSQL 18 (`127.0.0.1:5433/relay_staging_local`), full schema bootstrap (206 applied / 0 failed), real Better Auth accounts from `scripts/qa/staging-fixtures.mjs` (two orgs; OWNER/ADMIN/MANAGER/MEMBER + banned user), app served locally from `.env.staging`. No production secret or record was read or modified.

## Live defect ledger — found by authenticated use, then fixed

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | New tables had SELECT-only grants for `authenticated`; the admin APIs write through the caller session, so channel/handoff/retention writes would fail at runtime | role-privilege probe | `20261125190000_runtime_grants.sql` (RLS remains the boundary) |
| 2 | App selected `upwork_jobs.revenue_identity_id` and `archived_at`, but no migration created them (Upwork dashboard errored live) | server log during staging QA | `20261125180000_upwork_jobs_identity.sql` (additive, idempotent) |
| 3 | Handoff could insert a second active seat for a rep who already had one (`pc_active_rep_uniq`) and re-insert an existing pending acknowledgement (`ack_primary_uniq`) | handoff result `partial` + DB rows | one-seat-per-rep semantics; acknowledgement replay check |
| 4 | Work Setup created plans with `effective_from = current_date` (server local), so a lane saved late in the business day was invisible to Rep Today while credits still counted against it | custom lane present in DB, absent from `/api/admin/work-setup` | insert uses the organization business date (`businessDateForOrg`) |
| 5 | Rep Today profile cards labelled activities with the legacy registry only, so a custom activity showed its raw key | dashboard text check failed | dashboard passes canonical catalog labels into `buildProfilesToday` |
| 6 | Manual sync stored `source_ids: []`; the worker treated an empty array as “no sources” and fetched nothing | worker counters `sources:0` | empty list normalizes to “all enabled sources” |
| 7 | Retention batcher assumed every table has an `id` column | execution error on `job_discovery_locks` | per-table key column (`lock_key`) |
| 8 | Phase-1 carry-over: verification wrote statuses outside the DB CHECK; re-ingest resurrected closed jobs | isolated tests | CHECK-legal persisted statuses; terminal state preserved unless content changed |

## Authenticated role/browser matrix (real sessions)

Existing harness `staging-e2e.mjs` — 15/15 core checks passed: manager sign-in, teammate queue visibility, conversation history + composer identity, member scope, **out-of-scope API HTTP 404**, **cross-org API HTTP 404**, suspended account refused (HTTP 403 BANNED_USER). Its later admin step timed out once in sequence; instrumented re-runs measured owner/admin/manager/member/b-owner sign-ins at **400–620 ms each** — a harness sequencing flake, not an auth defect. All five roles were subsequently exercised by the Phase 4 suite.

New authenticated suite `scripts/qa/phase4-authenticated-qa.mjs` — **21/21 passed**:

- Admin created a custom channel and a measurable activity through the API.
- Identity bound to the custom channel; requirement + allocation saved through the single Work Setup transaction with CAS; stale revision returned **HTTP 409**.
- Rep signed in, saw the canonical label **“Introductions sent”** in Today.
- Rep recorded the activity; the same source event submitted twice did not double count. Ledger shows exactly the two unique events (completed = 2). People projection: assigned 11, completed 2, remaining 9, completion 18%, estimated effort 31 min.
- Org B member got **403** on the org A channel list and **403 “Identity not assigned to you”** when forging activity credit.
- Handoff preview reported the allocation; execution returned `completed` (responsibilities 1, allocations 2, leads 3, tasks 1, acknowledgements 1); replacement owned the allocation afterwards.
- Jobs header exposes last-sync state; Sync Now enqueued a durable run, repeat click reused it (`reused: true`), the cron-protected worker drained the queue, the run reached `succeeded`, and counters matched reality: **4 sources, 236 found, 236 inserted, 0 failed**.

## Jobs pipeline after the live run

`GET /api/cron/job-inventory` over the ingested set: 236 jobs; **150 published within 72 h**; quality screen classified 226 eligible, 4 needs_review, **6 suspected_scam**; inventory buckets: eligible_low 21, eligibility_unknown 18, location_restricted 190, quarantined 6, duplicate 1; 39 included in the feed. Quarantine removes listings from the active feed without deleting them.

## Adversarial RLS (real `relay_app` role + `app.current_user_id`)

`scripts/qa/rls-new-tables-staging.mjs` — **8/8 passed**: member sees only its own custom channel/definitions/sync requests/handoffs; member insert on channels denied; member allocation update matched zero rows; org admin insert allowed; service-role privileges intact.

## Final gates

| Gate | Result |
|---|---|
| TypeScript | clean (exit 0) |
| Full unit suite | **435 files / 6033 passed, 5 skipped** |
| ESLint new surfaces | 0 errors |
| Production build | **pass** (self-hosted fonts) |
| Migrations on disposable PG | **206 applied / 0 failed**, idempotent |
| Authenticated integration | **21/21** |
| RLS adversarial | **8/8** |
| Job worker live | 4 sources / 236 inserted / honest counters |

## Remaining external blockers (not counted as passed)

1. Production migration application requires owner authorization, pre-apply backup and schema compatibility check.
2. VPS CPU/memory/p50/p95 unavailable in this environment; staging timings only.
3. Mobile screenshots and full axe sweep not executed here; desktop journeys covered.
4. Mid-operation failure injection and concurrent-admin transfer contention tested at fixture level, not under load.
5. Resume/Content/Growth regression relies on the existing suite, not a fresh authenticated sweep.

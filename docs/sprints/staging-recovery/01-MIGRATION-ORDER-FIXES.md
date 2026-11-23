# Migration order & shape fixes

`scripts/qa/staging-bootstrap.mjs` provisions a fresh database with the full
migration set. Getting from "174 of 201 apply" to "198 apply, 0 fail" required both
tooling and real migration corrections. No production migration was weakened; every
fix is additive or repairs a statement that could never have executed.

## Fixes inside migration files

| File | Defect | Fix |
|---|---|---|
| `0044_seed_revenue_identities.sql` | two `on conflict (profiles.id)` / `(identity_assignments…)` targets — invalid syntax, so the whole seed aborted on any clean database | unqualified column targets |
| `20261005000000_action_ledger_upwork.sql` | `create table if not exists upwork_jobs` assumes a fresh table; the pre-existing 0009 schema lacks 16 columns the rest of the file uses | idempotent `add column if not exists` for each new column before first use |
| `20261101160000_close_anon_exposure.sql` | RLS policies reference `relay_events.actor_rep_id` and `accountability_audit_log.actor_id`, which older databases do not have | idempotent adds before the policies |
| `20261110050000_upwork_relay_attribution_backfill.sql` | backfill reads `relay_runs.sender_profile_id`, `relay_events.revenue_identity_id`, `upwork_jobs.sender_profile_id` without adding them | idempotent adds |
| `20261110110000_upwork_v51_backfill.sql` | inserts columns `upwork_applications` does not have, declares `boost_connects` as the wrong type, and relies on a unique index that does not exist | idempotent adds, correct integer type, explicit unique index |
| `20261124000000_add_identity_assignments_updated_at.sql` | **new** — see below |

## The schema bug that broke Work Setup

`computeAccountRevision` (`work-setup-write.ts`) and `loadWorkSetup`
(`work-setup.ts`) both read `identity_assignments.updated_at`. Migration `0081`
created that table with only `created_at`. Consequence: on any database where an
assignment row existed, `GET /api/admin/work-setup` returned HTTP 500 — i.e. the
canonical admin surface was broken in production, not just staging.

The new migration adds the column and backfills it from `created_at`:

```sql
alter table identity_assignments add column if not exists updated_at timestamptz;
update identity_assignments set updated_at = created_at where updated_at is null;
alter table identity_assignments alter column set not null / set default now();
```

Verified live: after the fix, `GET /api/admin/work-setup` returns 200 and shows the
shared LinkedIn lane (requirement 30, allocated 6) plus the solo Upwork lane
(requirement 8, allocated 0), matching the canonical ledger.

## Skipped migrations (recorded, not hidden)

Four historical demo-seed migrations are skipped by the bootstrap with printed
reasons: `0044`, `0079`, `0080` bind to production-era reps/profiles
(Aneeb/Hassan) that a clean database does not contain, and
`20261110080000_responsibility_reconciliation_v49` reconciles those same profiles.
They insert rows only; no table they create is required at runtime. Synthetic
fixtures replace their data.

## Repeatability

Bootstrap drops and recreates its own database on every run, applies migrations with
dependency-aware retries (passes repeat until no progress), and exits non-zero on any
unskipped failure. Running bootstrap + fixtures + E2E twice produced 19/19 both times.

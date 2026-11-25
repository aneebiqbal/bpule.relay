# Relay Unified Operations — Phase 3 Final Certification

**Date:** 2026-11-25 · **Starting SHA:** `eeebb798` · **Tree:** uncommitted, one working tree
**Production migrations applied:** none — owner authorization still required
**Production workers activated/deployed:** no

## 1. Migration certification on disposable PostgreSQL

Runner: `scripts/qa/staging-bootstrap.mjs` against `postgres://mac@127.0.0.1:5433/relay_staging_local`
(target validated local by the script; Aiven/production URLs refused).

Result (fresh run after all migrations):

| Metric | Value |
|---|---|
| migration files | 208 |
| applied | **204** |
| intentionally skipped | 4 (historical demo seeds requiring production-era reps; recorded reasons) |
| failed | **0** |

New migrations certified: `20261125120000_manual_job_sync`, `20261125130000_execution_channel_catalog`, `20261125140000_job_quality`, plus `20261125150000_execution_catalog_grants`, `20261125160000_responsibility_handoffs`, `20261125170000_retention_runs`.

Isolated testing caught and fixed three real defects before any production consideration:
1. `on set null` syntax error in the manual-sync migration (corrected to `on delete set null`).
2. `recording_modes` text[] cast failure in the catalog seed (`v.recording_modes::text[]`).
3. **Missing table privileges** — new tables had no grants for `relay_service`/`relay_app`/`authenticated`; a grants migration now provisions whichever role set exists. Verified: `has_table_privilege('relay_service','execution_channels','INSERT') = true`, `job_sync_requests UPDATE = true`, `relay_app SELECT = true`, `authenticated SELECT = true`.

Verified objects/constraints/policies:
- 5 channels, 16 activity definitions, 8 aliases seeded exactly as designed.
- Partial unique current-definition index, channel/system slug indexes, sync one-active-per-org index present.
- CHECK constraints for counting mode, evidence policy, operation mode, template, quality classification and verification status (which excludes the previously written illegal statuses).
- RLS enabled on all four new tables with explicit select/insert/update/delete policies.
- Idempotency: re-applying all new migration files succeeds and leaves counts unchanged (5/16/8).

## 2. Real handoff execution (not mocked)

Script: `scripts/qa/integration-handoff-retention.mts` against the same disposable DB.
Fixture: departing rep received a PRIMARY seat, an identity plan with a 10-unit allocation, one active lead, one open follow-up task.

Observed result: `status: completed` with responsibilities 1, allocations 1, leads 1, tasks 1, acknowledgements 1, failedItems [].
Post-conditions read back from PostgreSQL:
- coverage row: departing rep `active=false`, replacement rep `active=true`;
- allocation row: departing rep `active=false`, replacement rep `active=true`;
- lead `owner_rep_id` = replacement;
- task `assignee_rep_id` = replacement.
History is untouched; no requirement row changed; per-item checkpoints are stored on `responsibility_handoffs`. The admin UI (`Admin → Handoffs`) previews every item and blocks ineligible/capacity-review transfers.

## 3. Real retention execution (dry-run then executed)

Same script.
- Preview reported candidate counts plus protected-reference counts (`jobsWithApplications`, `savedJobs`), proving protected classes are excluded by construction.
- Dry run recorded an audited `retention_runs` row and deleted nothing.
- Execution against a planted expired `job_discovery_locks` row deleted **1** and left 0; status `completed`.
Only Class C ephemeral rows (expired locks, >30-day source snapshots, >90-day ingestion-run metadata) are candidates. Protected business history is never queried for deletion.

## 4. Per-rep workload (admin)

`GET /api/admin/work-setup` now returns a canonical `people` array built from the ONE accountability projection:
personal allocated units, completed, remaining, completion % (null when there is no personal target — the UI prints “No assigned activity target.”), estimated effort minutes from catalog estimates, overdue tasks, shared-lane target. Work Setup renders a “People workload” table. No invented utilization: without configured availability the UI says capacity is not configured.

## 5. Build reproducibility

Root cause: `next/font/google` (IBM Plex Sans) required a live Google Fonts fetch and failed offline. Fix: vendored IBM Plex Sans/Mono latin subsets under `src/app/fonts/` (SIL OFL 1.1, license file included) and switched `src/app/layout.tsx` to `next/font/local`. Production build now passes with no font network dependency: `EXIT=0`, `✓ Compiled successfully in 22.7s`.

## 6. Final gate results

| Gate | Result |
|---|---|
| TypeScript `--noEmit` | clean |
| Full unit/contract suite | **435 files passed / 1 skipped; 6033 passed / 5 skipped** |
| ESLint (new/changed surfaces) | 0 errors |
| Production build | **pass** |
| Migration apply on disposable PG | 204 applied / 0 failed / idempotent |
| Handoff execution on real PG | completed, all five workstreams moved |
| Retention dry-run + execute on real PG | audited; expired lock purged |
| Authenticated browser OWNER/ADMIN/MANAGER/MEMBER × 2 orgs | **not run** (needs running staging app + real Better Auth sessions) |
| RLS adversarial live suite | **not run** (needs service key/synthetic two-org staging) |
| Performance p50/p95 benchmarks | **not run** |

## 7. Release readiness

**GO for integration/release-candidate code.** Deterministic gates are green; isolated PostgreSQL proves the schema, handoff and retention behavior.

**NO-GO for production activation** until: (a) the six migrations are applied by the owner with a pre-apply backup, (b) authenticated role-matrix browser tests pass on staging, (c) RLS adversarial tests pass across two organizations, (d) performance budgets are measured on the VPS.

Known limitation: `Sync Now` API writes through the caller session; admin/owner is enforced. RLS policies were verified structurally but not adversarially at runtime.

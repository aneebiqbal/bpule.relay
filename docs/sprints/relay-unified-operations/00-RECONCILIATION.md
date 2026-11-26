# Relay Unified Operations — Phase 1 Reconciliation & First Verified Slice

**Date:** 2026-11-25
**Baseline SHA:** `eeebb798` (`fix/ui-qa-pass`, clean tree at start)
**Branch state:** changes uncommitted, in one working tree
**Production migration applied:** **no** (owner authorization required)

> **Update 2026-11-25 (Phase 2):** the resolver-based catalog, admin Channels surface, capacity engine, job quality/quarantine, sync lease recovery, pending-connection send gate, reply credit and archive-policy reconciliation are implemented in this tree. See `01-PHASE2-DELIVERY.md` for schema, mapping, evidence and remaining blockers. This file is retained as the Phase 1 architecture reconciliation.

## 1. The brief's premise vs the actual repository

The program brief describes a pre-V6 product. The repository is well past that:

| Brief assumption | Actual state |
|---|---|
| Feature branch `feat/relay-job-intelligence-v2` holds pending work | Already merged into `main`/`fix/ui-qa-pass`; `origin/feat/relay-job-intelligence-v2` is an ancestor of HEAD |
| Jobs pipeline needs building | Exists end-to-end: `job_sources` → adapters → `ingest.ts` → `jobs` → `job_inventory_index` → `listJobs()` → `/jobs`; systemd timers every 10–15 min |
| Requirements/allocations need rebuilding | Canonical V6.1/V7 model exists: `daily_target_plans` (requirement per channel identity), `daily_plan_allocations` (explicit per-rep share), `daily_accountability` (contribution truth, exactly-once via `source_event_ids` + RPC) |
| Channel system absent | Partly: `revenue_identities.channel` enum (`linkedin\|upwork\|email\|other`) and a hardcoded TS `ACTIVITY_REGISTRY`; no admin-configurable catalog, no versioning, no effort minutes |
| Capacity engine needed | Absent — no `effort_minutes`, `capacity`, or utilization anywhere |

Conclusion: the real program is **not** greenfield. It is (a) finish the configurable channel/activity catalog, (b) fix concrete correctness defects in the existing canonical systems, (c) close the jobs freshness/sync contract. Building a second planning or ledger system would violate the brief's own "one canonical service" rule.

## 2. Root causes established from source

### 2.1 Jobs showed 3–4 day-old listings as fresh
1. The default feed had **no freshness window** (`filters.freshnessDays` undefined ⇒ no SQL cutoff). The inventory bucket permits jobs up to 60 days old.
2. Default sort was `match_desc`, so a high-match older job outranked a genuinely new one.
3. Ordering used `coalesce(posted_at, first_seen_at)`: a listing with an **unknown publication date** sorted as if published when Relay first discovered it — the exact conflation §16 forbids.

### 2.2 Manual refresh violated the async contract
`POST /api/jobs/sources/refresh` ran `runJobDiscovery` **inside the request** (maxDuration 120 s, up to 4 sources × 20 s), with no run handle, no explicit cooldown, and no global “Sync Now”.

### 2.3 Two release-blocking job defects
- `verify.ts` persisted `reachable_unconfirmed` / `verification_blocked`, which are **not in the `jobs.verification_status` CHECK constraint**. The first such candidate aborts the whole verification tick.
- `ingest.ts` unconditionally overwrote `verification_status` on every successful re-ingest, so a job confirmed `closed` by a 404 check silently returned to the active feed while the source kept returning it.

### 2.4 Activity vocabulary split (blocks explainable counting)
Two codes for the same work: stored lanes use `connection_request`, `dm`, `followup`, `application`, `proposal`, `prospect_extracted`; `ACTIVITY_REGISTRY` uses `connection_sent`, `dm_sent`, `followup_sent`, `application_submitted`, `proposal_generated`. No mapping layer; labels are re-derived per surface.

## 3. Delivered in this slice (verified, uncommitted)

### Fresh-first feed
- `resolveFreshnessWindow(view, freshnessDays)` in `src/lib/job-discovery/service.ts`: absent window ⇒ **72 h** (`JOBS_DEFAULT_FRESHNESS_DAYS`) on `shortlist` / `latest` / `for-you` / `verified-remote`; personal/historical views never inherit it; explicit `0` = all open.
- SQL now filters `posted_at >= cutoff` (NULL dates can never qualify).
- Sort orders use `posted_at desc nulls last`; unknown-date listings sort last instead of posing as newest.
- Jobs page passes the resolved window so the control and the query agree; UI options are **Last 24 h / Last 72 h / Last 7 days / All open**; cards show “unknown date” when no publication date exists.

### Honest sync
- New durable `job_sync_requests` table (migration `20261125120000_manual_job_sync.sql`): one active request per organization (partial unique index), cooldown enforced in `requestManualSync`.
- `POST /api/jobs/sync` enqueues and returns `{requestId,status,reused}` — **no crawling in the request**. `GET /api/jobs/sync?requestId=…` polls.
- Scheduled discovery worker executes the oldest queued run with `force: true` (new `RunOptions.force`, bypasses only the polling interval, not caps/timeouts).
- Jobs header shows **Last synced** (`max(job_sources.last_ok_at)`, success only) and an admin **Sync now** button with live status and new/updated/expired/failed counts; the feed refreshes on completion.

### Defect fixes
- `verify.ts` persists only CHECK-legal statuses (`PERSISTABLE_VERIFICATION_STATUSES`); nuanced outcomes remain in `verification_evidence.type`.
- `ingest.ts` preserves `closed`/`expired` across re-ingest **unless content changed**; changed content re-enters evaluation, unchanged closed stays closed.

### Tests added / updated
- `tests/job-freshness-contract.test.ts` (6 tests)
- `tests/job-manual-sync-contract.test.ts` (5 tests)
- `tests/job-verification.test.ts` updated to assert CHECK-legal persisted values

## 4. Verification actually executed

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| ESLint on changed files | 0 errors (5 pre-existing warnings: 3 `window.location.href`, 1 unused import, 1 ignored test path) |
| Full unit/contract suite | **430 files passed / 1 skipped; 6001 passed / 5 skipped** |
| Targeted job suites | 89 passed |
| Production build | not run in this slice |
| Live-DB / browser role matrix | not run (needs disposable DB + auth sessions) |

## 5. Migration impact report (read-only)

`supabase/migrations/20261125120000_manual_job_sync.sql` — additive, idempotent:
- creates `job_sync_requests` + two indexes, enables RLS, adds SELECT (same org) and INSERT (org admin) policies; no client UPDATE/DELETE.
- No existing table, column, row, or policy is altered. No data migration, no deletion.
- Apply order: after the latest current migration (`20261123120000_preparation_gates.sql`). DDL must be applied by the owner/service role per `OPS.md`.

## 6. Still open (ranked, with evidence)

1. **Admin-configurable channel/activity catalog** — no table/UI/API; `ACTIVITY_REGISTRY` hardcoded; two activity vocabularies unmapped. This is the brief's headline and the largest remaining piece.
2. **Capacity in minutes** — absent; allocations are unit counts only.
3. **Team handoff** — no departing-rep flow; identity transfer explicitly leaves leads/tasks/prepared work; `referLead` resets status and moves nothing.
4. **Pending-connection send gate** — recommendations respect it; `conversation/send` and email send paths do not.
5. **Reply credit disconnected** — `reply_handled`/`email_reply_handled` are registry-only; replies are excluded from `record_activity_event`.
6. **Scam/quarantine** — no risk flags or quarantine in the discovery pipeline.
7. **Retention execution** — report is advisory; ingestion hard-deletes snapshots/runs without dry-run/batch/audit.
8. **Archive drift** — 14 d state-machine expiry vs 21 d cron archive; email reply does not clear `archived`.

## 7. Recommended next slice

Build the channel/activity catalog **onto** the existing lane model rather than beside it:

- `execution_channels` + `execution_activity_definitions` (stable key, counting mode, evidence policy, targetable, effort minutes, version, active) seeded from the current registry/default packs.
- Definitions materialize into the canonical `daily_target_plans.activity_type` lane so Work Setup, allocations, Rep Today, accountability and reporting work unchanged; a resolver replaces the per-surface label maps so custom channels read correctly everywhere.
- Admin API + a Channels sub-view under Admin → Work Setup, using the existing capability gates (`MANAGE_TEAM_TARGETS` / `MANAGE_REVENUE_IDENTITIES`).
- Additive migration only; historical lane meaning preserved.

This needs one product decision before implementation: whether a custom channel’s activity keys become first-class stable IDs (requires touching every label surface) or are surfaced through a single resolver that all surfaces already call. The resolver route is smaller and keeps one vocabulary.

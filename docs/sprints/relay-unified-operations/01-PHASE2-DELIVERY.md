# Relay Unified Operations — Phase 2 Delivery

**Date:** 2026-11-25 · **Base SHA:** `eeebb798` · **Tree:** uncommitted, one working tree
**Production migrations applied:** none · **Deployed/merged:** no

> **Update 2026-11-25 (Phase 3):** team handoff, per-rep workload UI, safe retention execution, catalog grants, self-hosted fonts and isolated migration/handoff/retention certification are now implemented. See `02-PHASE3-CERTIFICATION.md`. The “Remaining blockers” list in this Phase 2 file is historical; handoff and retention-execution are closed.

## 1. Canonical channel + activity catalog

Migration `supabase/migrations/20261125130000_execution_channel_catalog.sql` (additive, idempotent):

- `execution_channels` — org-owned custom channels plus NULL-org built-in templates (`linkedin`, `upwork`, `email`, `direct-replies`, `general`). Immutable slug, template, operation mode (`manual_evidence | relay_native | connected_provider | import_webhook`), identity requirements JSON, revision, RLS.
- `execution_activity_definitions` — stable immutable `key`, label, counting mode, evidence policy, targetable, enabled, `effort_minutes`, recording modes, duplicate policy, outcome class, `version`, effective dates. One **current** definition per `(channel,key)` via partial unique index; edits close the old row and insert a new version so history is never reinterpreted.
- `execution_activity_aliases` — legacy/registry key → canonical key, scoped per channel (`unique(channel_id, alias_key)`).
- `revenue_identities.channel_id` — explicit canonical reference for custom channels; the legacy `channel` enum is untouched and remains the fallback resolution path.

### Legacy → canonical mapping (seeded)

| Channel | Canonical key | Legacy/registry alias | Notes |
|---|---|---|---|
| linkedin | `connection_request` | `connection_sent` | invitation confirmed sent |
| linkedin | `dm` | `dm_sent` | distinct conversation |
| linkedin | `followup` | `followup_sent` | eligible follow-up |
| linkedin | `prospect_extracted` | — | unique prospect |
| linkedin | `reply_handled` | — | tracked-only; credited on outbound reply |
| upwork | `application` | `application_submitted` | confirmed external submission |
| upwork | `proposal` | `proposal_generated` | preparation only, **not** an application |
| email | `email` | `email_sent` | verified send |
| email | `followup` | `email_followup_sent` | scoped separately from LinkedIn follow-up |
| email | `prospect_extracted` | — | unique email lead |
| email | `email_reply_handled` | `email_reply_handled` | handled inbound reply |
| direct-replies | `reply_drafted`, `reply_confirmed_sent`, `conversation_resolved`, `followup_scheduled` | — | three separate meanings, never auto-awarded together |
| general | `other` | — | keeps the historical untargeted lane resolvable |

Canonical keys deliberately equal the existing `daily_target_plans.activity_type` strings, so **no historical lane was rewritten**. A proposal draft and a submitted application remain separate definitions.

## 2. One resolver

`src/lib/execution/activity-catalog.ts` — `loadActivityCatalog()` + `CanonicalActivityResolver`:
`resolveActivityDefinition`, `resolveLegacyActivityKey`, `listChannelActivities`, `validateActivityEvent`, `resolveActivityCountingPolicy`, `resolveActivityEffort`, `getActivityDisplayMetadata`, `channelForIdentity`.

Contract: unknown keys return `unknown`; unmapped legacy keys return `unmapped_legacy`; disabled returns `disabled`. **Nothing is folded into `other` and nothing is credited by a fallback.** Tests: `tests/canonical-activity-catalog.test.ts` (10 tests).

Wired into:
- `/api/accountability/event` — authorization boundary validates the key against the identity's channel and persists the canonical key.
- `load-plan-progress.ts` — all plan/team/Rep projections label through the resolver (registry only as display fallback).
- Work Setup read model + UI — payload carries the catalog; the drawer lists every enabled activity for the account channel and has an “Add activity” control.

## 3. Admin Channels UI + API

- `GET/POST /api/admin/channels`, `PATCH/DELETE /api/admin/channels/[id]`, `GET/POST .../[id]/activities`, `PATCH/DELETE /api/admin/channels/activities/[definitionId]`.
- Gates: `MANAGE_TEAM_TARGETS` or `MANAGE_REVENUE_IDENTITIES`, org-scoped reads/writes, server-side enum/pattern validation (`channel-admin.ts`); no SQL/expressions/scripts accepted.
- Page `Admin → Channels` (`/admin/channels`, nav item under Operations). Built-in templates are read-only; custom channels support create, disable (never hard delete), add/edit activities with versioning, enable/disable.
- `PATCH /api/admin/revenue-identities/[id]` accepts `channelId` to bind an identity to a custom channel.

### Custom-channel acceptance path (Scenario A)
Admin creates a custom channel → adds activities → binds an identity via `channelId` → Work Setup now offers those activities (no code change) → admin sets target + allocates to an eligible rep → Rep Today/team projections read the same canonical ledger → rep records via the validated event route → exactly-once RPC credit → admin sees completion under the correct label. Unit-tested at the resolver level; **end-to-end not yet proven live** (needs migration + auth sessions).

## 4. Capacity engine

`src/lib/execution/capacity.ts` — pure, tested (`tests/capacity-engine.test.ts`, 7 tests):
`planned = Σ(allocated units × effective estimated minutes) + non-overlapping task minutes`; `utilization = planned / available`; bands `available < 80%`, `near_capacity 80–100%`, `overloaded > 100%`; org thresholds overridable; zero-availability is explicit; negative/NaN inputs clamp rather than understate. It never changes credited units.
Work Setup exposes per-account `estimatedEffortMinutes` and an organization total (from catalog effort). Per-rep utilization against a configured available-minutes budget is **not yet surfaced in the UI** — see blockers.

## 5. Jobs: freshness, sync recovery, quality

Preserved and extended from Phase 1 (see `00-RECONCILIATION.md`):
- 72h default fresh window, 24h/72h/7d/All Open, publication-date sorting, honest last-sync timestamp.
- Async durable manual sync with one active run/org, 15-minute cooldown, cron execution, status polling, **lease reclaim after a 10-minute stall** so a crashed worker cannot strand a queued request.
- `verify.ts` CHECK-legal statuses; closed/expired preserved across re-ingest unless content changed.
- New conservative quality screen (`quality.ts`, migration `20261125140000_job_quality.sql`): `jobs.quality_classification` + `quality_reasons`, feed projection bucket `quarantined` excludes `suspected_scam` without deleting. Rules are request-shaped (`wire transfer`, `starter kit`, sensitive-data asks, contradictory compensation, invalid apply host). Remote/high-pay/salary-silent roles are never flagged. Tests: `tests/job-quality-screening.test.ts` (6 tests).

## 6. Messaging gates, reply credit, archive policy

- Pending-connection gate enforced at `POST /api/leads/[id]/conversation/send` for DM/reply/follow-up/custom (connection invitations exempt): archived leads and unaccepted connections are blocked with a readable 409.
- Reply handling now earns exactly-once credit through the canonical ledger: outbound reply persisted → `reply_handled` with source id `reply:<messageId>:<identityId>`. Received replies alone earn nothing; the original non-reply credit path is byte-for-byte unchanged (static contracts preserved).
- ONE archive policy resolver (`src/lib/leads/archive-policy.ts`, tests 4): pending connection review at **14 days** (aligned with the state machine), new lead 30 days, follow-ups exhausted after max 3 + 3 quiet days, any reply makes a lead active. Cron sweep now uses it; inbound email restores `archived=false`.

## 7. Verification executed

| Gate | Result |
|---|---|
| TypeScript `--noEmit` | clean |
| Full unit/contract suite | **6027 passed / 5 skipped / 1 environmental timeout flake** (`accountability-service` DB connect; passes in isolation) |
| New targeted suites | catalog 10, capacity 7, quality 6, archive 4, freshness 6, manual sync 5 |
| Production build | **blocked by environment**: Turbopack cannot resolve `@vercel/turbopack-next/internal/font/google/font` because Google Fonts fetch is unavailable offline. Not a code failure; needs network or pre-fetched fonts |
| PostgreSQL integration / RLS adversarial / authenticated browser | not run — require disposable DB + auth sessions |
| Migration dry-run | not run — owner authorization required |

## 8. Migrations delivered (pending owner apply, filename order)

1. `20261125120000_manual_job_sync.sql`
2. `20261125130000_execution_channel_catalog.sql`
3. `20261125140000_job_quality.sql`

All additive/idempotent. No production data migration or deletion.

## 9. Remaining blockers (honest)

1. **Team handoff (§8) not implemented.** This is a release-blocking gap for the full program: a departing-rep flow with impact preview and atomic transfer of identities/allocations/leads/tasks/follow-ups/prepared work does not exist, and the existing identity transfer explicitly moves none of them. Deliberately not stubbed — a partial transfer would corrupt attribution.
2. **Retention executor (§12) not implemented.** The existing report is advisory; ingestion still hard-deletes snapshots/runs without dry-run/batch/audit. Protected-reference cleanup is unbuilt.
3. **Per-rep capacity utilization UI** not surfaced; engine + work-load effort exist.
4. **Live certification pending:** migration apply, RLS adversarial, concurrency/lease tests, authenticated OWNER/ADMIN/MANAGER/MEMBER browser matrix, performance benchmarks.
5. Production build requires network access for fonts in this environment.

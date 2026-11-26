# Relay Unified Operations — Release Candidate

**Date:** 2026-11-26 · **Base SHA:** `eeebb798` · **Final commit:** see below
**Branch:** `fix/ui-qa-pass` (no push/merge/deploy) · **Production:** never modified

## Commits

| SHA | Scope |
|---|---|
| `7b942ec8` | fresh-first Jobs, durable async Sync Now, honest verification, quality quarantine |
| `636e1496` | execution channel catalog, canonical resolver, capacity engine, admin surfaces |
| `f09d364b` | durable handoffs, safe retention executor, unified archive policy, messaging gates |
| `aa1612a8` | self-hosted IBM Plex (offline-reproducible build) |
| `d0de2e57` | certified QA harnesses, permission matrix, evidence |
| `9c57e779` | canonical validation on credit + rep capacity utilization |
| `3702b69d` | accessibility fixes + mobile sweep |

Tree: **clean**. No secrets, fixtures or debug code committed.

## Migrations (pending production)

Nine additive, idempotent migrations in filename order:

1. `20261125120000_manual_job_sync.sql`
2. `20261125130000_execution_channel_catalog.sql`
3. `20261125140000_job_quality.sql`
4. `20261125150000_execution_catalog_grants.sql`
5. `20261125160000_responsibility_handoffs.sql`
6. `20261125170000_retention_runs.sql`
7. `20261125180000_upwork_jobs_identity.sql` (repairs two columns the app already selects)
8. `20261125190000_runtime_grants.sql`
9. `20261125200000_rep_capacity_settings.sql`

Certification: disposable PostgreSQL bootstrap applies **207 / 0 failed**, idempotent re-apply verified. Production has **200 recorded versions**; read-only comparison confirms the nine above are absent and the new tables do not exist yet.

Separate owner decision: `20261110080000_responsibility_reconciliation_v49.sql` is a historical data reconciliation, **not additive**. Read-only production inspection shows its pre-state (`daily_targets` row for Zaira application still owned by the old rep; coverage rows unchanged). It is excluded from this release's auto-apply list and must be approved/reconciled independently.

## Permission matrix (verified on real roles)

| Table | authenticated / relay_app | service_role |
|---|---|---|
| execution_channels | SELECT + INSERT/UPDATE/DELETE (RLS org-admin) | full |
| execution_activity_definitions | SELECT + DML (RLS org-admin) | full |
| execution_activity_aliases | SELECT only | full |
| job_sync_requests | SELECT + INSERT (org-scoped; no UPDATE/DELETE for clients) | full |
| responsibility_handoffs | SELECT + INSERT (RLS org-admin) | full |
| retention_runs | SELECT + INSERT (RLS org-admin) | full |
| rep_capacity_settings | SELECT + INSERT/UPDATE (RLS org-admin) | full |

Adversarial results: **8/8** table RLS scenarios and **4/4** privilege scenarios under `relay_app` + `app.current_user_id`; member cross-org reads invisible, member writes denied, admin allowed, service role intact. SECURITY DEFINER audit: all public definer functions reviewed; the three with default ACL are trigger-only (`prorettype=trigger`) and cannot be invoked directly — no escalation found.

## Authenticated E2E

- Existing staging suite: 15/15 core journeys (manager/member scope, 404s, banned refusal).
- Phase 4 authenticated suite: **23/23** — custom channel + activity, identity binding, CAS save + **HTTP 409**, exactly-once credit, People projection, capacity configuration (240 min → 13% utilization, “Capacity not configured” when null), cross-org denials, handoff completion and replacement ownership, Sync Now enqueue/dedupe/worker terminal state.
- Real worker: **4 sources / 236 inserted**; inventory: **150 fresh ≤72h**, **6 suspected_scam quarantined**, 39 feed-included; UI shows honest counters.
- Accessibility/mobile: **10/10 sweeps (5 surfaces × desktop+mobile), 0 axe violations**; screenshots in `artifacts/`.

## Performance (staging, local PostgreSQL, single user — NOT VPS)

p50/p95 navigation ms: OWNER /dashboard 42/61, /chats 39/48, /tasks 44/51, /leads 31/60, /jobs 25/31, /admin/targets 26/34; ADMIN similar (≤43/44); MANAGER /dashboard 68/75 worst case. Full table in `scripts/qa/staging-performance.mjs`. VPS CPU/memory/query-count measurement remains unverified (no VPS access).

## Migration runbook

1. Take an Aiven backup; record current `schema_migrations` count (200) and DB size (~397 MB).
2. Apply the nine migrations in filename order with the **owner-level** connection in `RELAY_DDL_DATABASE_URL`:
   `node scripts/apply-migrations.mjs` (the runner fails closed without it and refuses to reuse `DATABASE_URL`/`SERVICE_DATABASE_URL`).
   CI reads the same value from the `RELAY_DDL_DATABASE_URL` repository secret.
   > Incident 2026-11-26: an earlier deploy attempt ran migrations with the restricted app role and failed **0 applied / production unchanged**. The runner now preflights `has_schema_privilege(current_user,'public','CREATE')`.
3. Verify: new tables exist; `has_table_privilege('relay_service',…,'INSERT')` true; seed counts 5 channels / 16 activities / 8 aliases; app login + `/api/admin/channels` load.
4. Deploy code **after** schema verification. All migrations are additive; if code deploy fails, the schema remains forward-compatible (old code ignores new tables). Do not restore the whole database for a code rollback.
5. Decide `v49` separately with its own backup point.

## Gates

TypeScript clean; **6033 unit tests passed / 5 skipped**; ESLint 0 errors; production build pass; migration certification 207/0; authenticated 23/23; RLS 12/12 combined; a11y 10/10.

## Remaining blockers

1. Owner authorization + backup for the nine migrations (and separate v49 decision).
2. VPS performance/resource measurement unavailable here.
3. Resume/Content/Growth surfaces relied on the existing suite, not a fresh authenticated sweep.
4. Load-level concurrent-admin contention and mid-transfer failure injection tested at fixture level only.

## Verdict

**GO** — one integrated, reviewed release candidate with a low-risk additive deployment procedure.
**NO-GO for production until step 1 of the runbook is authorized.**
